const config = require("./config");

const getLockedInProfitString = (
  initialTrailingStopPrice,
  trailingStopPrice
) => {
  const { trailingStopPercentageDistance } = config;
  const trailingStopPercentDifference = Number(
    ((trailingStopPrice.toNumber() - initialTrailingStopPrice.toNumber()) /
      initialTrailingStopPrice.toNumber()) *
      100
  ).toFixed(2);
  const trailingStopPercent = trailingStopPercentageDistance * 100;

  let lockedInProfitPercentage = 0;
  if (trailingStopPercentDifference > trailingStopPercent) {
    lockedInProfitPercentage =
      trailingStopPercentDifference - trailingStopPercent;
  }

  return getColoredPercentageString(lockedInProfitPercentage);
};

const getCurrentProfitPercentage = (lastPrice) => {
  const { purchasePrice } = config;
  const currentProfitPercentage = Number(
    ((lastPrice.toNumber() - purchasePrice) / purchasePrice) * 100
  ).toFixed(2);

  return getColoredPercentageString(currentProfitPercentage);
};

const getColoredPercentageString = (percentage) => {
  const percentString = `${percentage}%`;

  if (percentage > 0) {
    return "\033[32m" + percentString + "\033[0m";
  } else if (percentage < 0) {
    return "\033[31m" + percentString + "\033[0m";
  }

  return percentString;
};

module.exports = {
  getLockedInProfitString,
  getCurrentProfitPercentage,
  getColoredPercentageString,
};
