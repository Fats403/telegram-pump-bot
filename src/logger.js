const { createLogger, format, transports } = require("winston");
const { combine, timestamp, printf } = format;

const logFormat = printf((info) => {
  return `[${info.timestamp}] ${info.level}: ${info.message}`;
});

const logger = createLogger({
  format: combine(timestamp(), logFormat),
  transports: [
    new transports.Console(),
    new transports.File({ filename: "combined.log" }),
    new transports.File({ filename: "error.log", level: "error" }),
  ],
});

module.exports = logger;
