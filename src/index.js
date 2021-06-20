require("dotenv").config();

const readline = require("readline");
const { getExchangeClient } = require("./exchange");
const logger = require("./logger");
const _ = require("lodash");
const { BigNumber } = require("bignumber.js");
const {
  getCurrentProfitPercentage,
  getLockedInProfitString,
  getColoredString,
} = require("./utils");
const {
  channelTriggerIds,
  exchange,
  searchQuote,
  quoteAssetAmount,
  simulate,
  exchangeApiKey,
  exchangeSecretKey,
  profitTargets,
  trailingStopPercent,
  trailingStopUpdateIntveral,
  slippageTolerance,
} = require("./config");
const {
  sendCode,
  signIn,
  getUser,
  getPassword,
  checkPassword,
  getSRPParams,
  mtproto: telegram,
} = require("./telegram");

const exchangeClient = getExchangeClient({
  exchange,
  apiKey: exchangeApiKey,
  secret: exchangeSecretKey,
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

readline.emitKeypressEvents(process.stdin);
process.stdin.setRawMode(true);

BigNumber.config({ DECIMAL_PLACES: 8 });

let confirmingTrade = false;
let trailingStopPrice, initialTrailingStopPrice, currentTradeData, ticker;

// TODO: make sure if it detects a new base, cancel listeners

(async function init() {
  logger.info("Connecting to telegram...");

  let authResult = await getUser();

  if (!authResult) {
    const { phone_code_hash } = await sendCode();

    let code = await ask("Enter MFA Code: ");

    try {
      authResult = await signIn({
        code,
        phone_code_hash,
      });
    } catch (error) {
      if (error.error_message !== "SESSION_PASSWORD_NEEDED") {
        logger.error(error.error_message);
        process.exit(1);
      }

      const { srp_id, current_algo, srp_B } = await getPassword();
      const { g, p, salt1, salt2 } = current_algo;

      let password = await ask("Enter password: ");

      const { A, M1 } = await getSRPParams({
        g,
        p,
        salt1,
        salt2,
        gB: srp_B,
        password,
      });

      authResult = await checkPassword({ srp_id, A, M1 });
    }
  }

  logger.info(
    `Successfully connected to telegram. Welcome, ${authResult.user.first_name}!`
  );

  logger.info("Retrieving market data...");

  const markets = await exchangeClient.loadMarkets();

  // retrieve every available base for the search quote
  const bases = _.filter(Object.keys(markets), (data) => {
    return data.split("/")[1] === searchQuote;
  }).map((symbol) => {
    const [base, quote] = symbol.split("/");
    if (searchQuote === quote) {
      return base;
    }
  });

  logger.info("Successfully retrieved market data.");

  if (!channelTriggerIds.length) {
    logger.info(
      `Actively watching all channel groups for a pair that can match with ${searchQuote} on ${exchange}.`
    );
  } else {
    logger.info(
      `Actively watching channel groups [${channelTriggerIds.toString()}] for a pair that can match with ${searchQuote} on ${exchange}.`
    );
  }

  telegram.updates.on("updates", (data) => {
    const { updates } = data;
    const newChannelMessage = _.find(updates, ["_", "updateNewChannelMessage"]);

    console.log(updates);

    if (!newChannelMessage || confirmingTrade) return;

    const {
      message: {
        message,
        peer_id: { channel_id },
      },
    } = newChannelMessage;

    if (
      channelTriggerIds &&
      channelTriggerIds.length > 0 &&
      channelTriggerIds.indexOf(channel_id) === -1
    ) {
      return;
    }

    logger.info(`New message (${channel_id}): ${message}`);

    for (let i = 0; i < bases.length; i++) {
      const base = bases[i];
      if (_.includes(message, base)) {
        confirmTradeTrigger(base);
        break;
      }
    }
  });
})();

async function confirmTradeTrigger(baseAssetFound) {
  // set a flag so we disregard any other messages so there is no override
  confirmingTrade = true;

  const confirm = await ask(
    `BASE ASSET FOUND: (https://www.binance.com/en/trade/${baseAssetFound}_${searchQuote}) ${getColoredString(
      baseAssetFound,
      "yellow"
    )} - confirm trade (Y/N)? `
  );

  if (confirm?.toLowerCase() === "y") {
    // set the global base asset to the one that was just found from the telegram message
    currentTradeData = {
      base: baseAssetFound,
    };

    // create the buy order
    let baseBuyOrder;
    try {
      baseBuyOrder = await createMarketBuyOrder();
    } catch (e) {
      logger.error(e.message);
      process.exit(1);
    }

    // add the purchase price and amount to the current trade data
    currentTradeData = {
      ...currentTradeData,
      purchaseAmount: baseBuyOrder.amount,
      purchasePrice: baseBuyOrder.price,
    };

    // arm the trade
    armTrade();
  } else if (confirm?.toLowerCase() === "n") {
    confirmingTrade = false;
    logger.info("Resuming watch..");
  } else {
    logger.info("Exiting Process.");
    process.exit(1);
  }
}

async function armTrade() {
  // get the current trade amount and purchase price, convert to big numbers
  let { purchaseAmount, purchasePrice } = currentTradeData;
  purchaseAmount = new BigNumber(purchaseAmount);
  purchasePrice = new BigNumber(purchasePrice);

  // book profit target orders
  try {
    profitTargetOrders = await bookProfitTargetOrders({
      amount: purchaseAmount,
      price: purchasePrice,
    });
  } catch (e) {
    throw new Error(e.message);
  }

  // set initial trailing stop values
  initialTrailingStopPrice = getStopPrice(purchasePrice);
  trailingStopPrice = initialTrailingStopPrice;

  // start to watch price for trailing stop loss price
  ticker = setInterval(tick, trailingStopUpdateIntveral);
}

const tick = async () => {
  const lastPrice = await getLastMarketPrice();

  logger.info(
    `PRICE: ${lastPrice}, CURRENT: ${getCurrentProfitPercentage(
      lastPrice,
      currentTradeData.purchasePrice
    )}, LOCKED: ${getLockedInProfitString(
      initialTrailingStopPrice,
      trailingStopPrice
    )}`
  );

  if (shouldTriggerStopMarketLoss(lastPrice)) {
    triggerStopMarketLoss(lastPrice);
    return;
  }
  if (shouldSetNewTrailingStop(lastPrice)) {
    triggerNewTrailingStopLimit(lastPrice);
  }
};

// ---------------------------------------

const getLastMarketPrice = async () => {
  const { base } = currentTradeData;
  const { info } = await exchangeClient.fetchTicker(`${base}/${searchQuote}`);
  return new BigNumber(info.lastPrice);
};

const getStopPrice = (price) => {
  return price.multipliedBy(1 - trailingStopPercent);
};

const shouldSetNewTrailingStop = (price) => {
  return getStopPrice(price).isGreaterThan(trailingStopPrice);
};

const shouldTriggerStopMarketLoss = (price) => {
  return price.isLessThanOrEqualTo(trailingStopPrice);
};

// ---------------------------------------

const triggerNewTrailingStopLimit = (price) => {
  trailingStopPrice = getStopPrice(price);
  if (!trailingStopPrice) return;

  logger.info(`TRAILING STOP UPDATED TO NEW HIGH: ${trailingStopPrice}`);
};

const triggerStopMarketLoss = async () => {
  // stop the ticker
  clearInterval(ticker);

  try {
    await cancelAllOrders();
  } catch (e) {
    logger.error(e.message);
  }

  logger.info(`ALL OPEN ORDERS CANCELLED.`);

  let order;
  try {
    order = await createMarketSellOrder();
  } catch (e) {
    logger.error(e.message);
  }

  logger.info(`STOP MARKET LOSS TRIGGERED: ${JSON.stringify(order)}`);
  process.exit(1);
};

// ---------------------------------------

async function createMarketBuyOrder() {
  let order;
  const { base } = currentTradeData;

  // calculate how much of the base asset we can purchase with the quote asset specified in the config
  const lastMarketPrice = await getLastMarketPrice();
  let amount = new BigNumber(quoteAssetAmount).dividedBy(lastMarketPrice);

  // apply the slippage tolerance
  if (slippageTolerance) {
    amount = amount.multipliedBy(1 - slippageTolerance).decimalPlaces(8);
  }

  try {
    order = await exchangeClient.createMarketBuyOrder(
      `${base}/${searchQuote}`,
      amount.toNumber(),
      {
        test: simulate ? true : undefined,
      }
    );
  } catch (e) {
    console.log(e);
    throw new Error(`MARKET BUY order failed. ${e.message}`);
  }

  return order;
}

async function createLimitSellOrder({ amount, price }) {
  let order;
  const { base } = currentTradeData;
  try {
    order = await exchangeClient.createLimitSellOrder(
      `${base}/${searchQuote}`,
      amount.toNumber(),
      price.toNumber(),
      {
        timeInForce: "GTC",
        test: simulate ? true : undefined,
      }
    );
  } catch (e) {
    throw new Error(`LIMIT SELL order failed. ${e.message}`);
  }

  return order;
}

async function createMarketSellOrder() {
  let order;
  const { purchaseAmount, base } = currentTradeData;

  try {
    order = await exchangeClient.createMarketSellOrder(
      `${base}/${searchQuote}`,
      purchaseAmount,
      {
        test: simulate ? true : undefined,
      }
    );
  } catch (e) {
    throw new Error(`MARKET SELL order failed. ${e.message}`);
  }

  return order;
}

function bookProfitTargetOrders({ amount, price }) {
  let orders = [];

  for (let i = 0; i < profitTargets.length; i++) {
    const targetData = profitTargets[i];
    const { sellBaseAssetPercent, profitPercent } = targetData;

    const sellAmount = amount.multipliedBy(sellBaseAssetPercent);
    const profitTargetPrice = price.plus(price.multipliedBy(profitPercent));

    try {
      orders.push(
        createLimitSellOrder({
          amount: sellAmount,
          price: profitTargetPrice,
        })
      );
    } catch (e) {
      //TODO: cancel any open orders if it fails to set a profit target properly
      throw new Error(e.message);
    }
  }

  return Promise.all(orders);
}

async function cancelAllOrders() {
  const { base } = currentTradeData;
  try {
    await exchangeClient.cancelAllOrders(`${base}/${searchQuote}`, {
      test: simulate ? true : undefined,
    });
  } catch (e) {
    throw new Error(`Cancel all order's failed. ${e.message}`);
  }

  return true;
}

function ask(question) {
  return new Promise((resolve) => {
    rl.question(question, (input) => resolve(input));
  });
}
