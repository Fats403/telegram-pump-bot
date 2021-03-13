require("dotenv").config();

const readline = require("readline");
const { getExchangeClient } = require("./exchange");
const logger = require("./logger");
const _ = require("lodash");
const { BigNumber } = require("bignumber.js");
const {
  getCurrentProfitPercentage,
  getLockedInProfitString,
} = require("./utils");
const {
  chatTriggerIds,
  exchange,
  searchQuote,
  quoteAssetAmount,
  simulate,
  exchangeApiKey,
  exchangeSecretKey,
  profitTargets,
  trailingStopPercent,
  trailingStopUpdateIntveral,
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

BigNumber.config({ DECIMAL_PLACES: 8 });

let trailingStopPrice, initialTrailingStopPrice, base;

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

  if (!chatTriggerIds.length) {
    logger.info(`Actively watching all chat groups.`);
  } else {
    logger.info(
      `Actively watching these chat groups. [${chatTriggerIds.toString()}]`
    );
  }

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

  telegram.updates.on("updateShortChatMessage", (data) => {
    const { message, chat_id } = data;

    if (
      chatTriggerIds &&
      chatTriggerIds.length > 0 &&
      chatTriggerIds.indexOf(chat_id) === -1
    ) {
      return;
    }

    logger.info(`New message (${chat_id}): ${message}`);

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
  let baseBuyOrder;
  let confirm = await ask(
    `BASE ASSET FOUND: ${baseAssetFound} (https://www.binance.com/en/trade/${base}_${searchQuote}), confirm trade (Y/N)? `
  );

  if (confirm?.toLowerCase() === "y") {
    // set the global base asset as the triggered base asset that was found
    base = baseAssetFound;

    try {
      baseBuyOrder = await createMarketBuyOrder({
        amount: new BigNumber(quoteAssetAmount),
      });
    } catch (e) {
      logger.error(e.message);
      process.exit(1);
    }

    // arm the trade with the amount and price of the purchased of the base asset found
    armTrade({ amount: basebuyOrder.amount, price: basebuyOrder.price });
  } else {
    logger.info("Exit process.");
    process.exit(1);
  }
}

async function armTrade({ amount, price }) {
  // book profit target orders
  try {
    profitTargetOrders = await bookProfitTargetOrders({
      amount: new BigNumber(amount),
      price: new BigNumber(price),
    });
  } catch (e) {
    throw new Error(e.message);
  }

  // set initial trailing stop values
  initialTrailingStopPrice = getStopPrice(new BigNumber(price));
  trailingStopPrice = initialTrailingStopPrice;

  // start to watch price for trailing stop loss price
  setInterval(tick, trailingStopUpdateIntveral);
}

const tick = async () => {
  const lastPrice = await getLastMarketPrice();

  logger.info(
    `PRICE: ${lastPrice}, CURRENT: ${getCurrentProfitPercentage(
      lastPrice
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
  const amount = new BigNumber(quoteAssetAmount);

  try {
    await cancelAllOrders();
  } catch (e) {
    logger.error(e.message);
  }

  logger.info(`ALL OPEN ORDERS CANCELLED.`);

  let order;
  try {
    order = await createMarketSellOrder({ amount });
  } catch (e) {
    logger.error(e.message);
  }

  logger.info(`STOP MARKET LOSS TRIGGERED: ${JSON.stringify(order)}`);
  process.exit(1);
};

// ---------------------------------------

async function createMarketBuyOrder({ amount }) {
  let order;
  try {
    order = await exchangeClient.createOrder(
      `${base}/${searchQuote}`,
      "MARKET",
      "buy",
      amount.toNumber(),
      {
        test: simulate ? true : undefined,
      }
    );
  } catch (e) {
    throw new Error(`MARKET BUY order failed. ${e.message}`);
  }

  return order;
}

async function createLimitSellOrder({ amount, price }) {
  let order;
  try {
    order = await exchangeClient.createOrder(
      `${base}/${searchQuote}`,
      "LIMIT",
      "sell",
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

async function createMarketSellOrder({ amount }) {
  let order;
  try {
    order = await exchangeClient.createOrder(
      `${base}/${searchQuote}`,
      "MARKET",
      "sell",
      amount.toNumber(),
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
    const { sellBasePercent, profitPercent } = targetData;

    const sellAmount = amount.multipliedBy(sellBasePercent);
    const profitTargetPrice = price.plus(price.multipliedBy(profitPercent));

    orders.push(
      createLimitSellOrder({
        amount: sellAmount,
        price: profitTargetPrice,
      })
    );
  }

  return Promise.all(orders);
}

async function cancelAllOrders() {
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
