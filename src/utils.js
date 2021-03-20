const config = require("./config");

const getLockedInProfitString = (
  initialTrailingStopPrice,
  trailingStopPrice
) => {
  const { trailingStopPercent } = config;
  const trailingStopPercentDifference = Number(
    ((trailingStopPrice.toNumber() - initialTrailingStopPrice.toNumber()) /
      initialTrailingStopPrice.toNumber()) *
      100
  ).toFixed(2);
  const trailingStopPercentDistance = trailingStopPercent * 100;

  let lockedInProfitPercentage = 0;
  if (trailingStopPercentDifference > trailingStopPercentDistance) {
    lockedInProfitPercentage =
      trailingStopPercentDifference - trailingStopPercentDistance;
  }

  return getColoredPercentageString(lockedInProfitPercentage);
};

const getCurrentProfitPercentage = (lastPrice, purchasePrice) => {
  const currentProfitPercentage = Number(
    ((lastPrice.toNumber() - purchasePrice) / purchasePrice) * 100
  ).toFixed(2);

  return getColoredPercentageString(currentProfitPercentage);
};

const getColoredPercentageString = (percentage) => {
  const percentString = `${percentage}%`;

  if (percentage > 0) {
    return getColoredString(percentString, "green");
  } else if (percentage < 0) {
    return getColoredString(percentString, "red");
  }

  return percentString;
};

const colors = {
  black: "\033[30m",
  red: "\033[31m",
  green: "\033[32m",
  yellow: "\033[33m",
  blue: "\033[34m",
  magenta: "\033[35m",
  cyan: "\033[36m",
  white: "\033[37m",
};

const getColoredString = (text, color = "white") => {
  if (!text || typeof text !== "string") return;
  return colors[color] + text + "\033[0m";
};

module.exports = {
  getColoredString,
  getLockedInProfitString,
  getCurrentProfitPercentage,
  getColoredPercentageString,
};
