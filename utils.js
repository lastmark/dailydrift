// utils.js – Shared helper functions
function formatNumber(num) {
  if (num === undefined || num === null) return '0';
  return Number(num).toLocaleString('en-US');
}

module.exports = { formatNumber };
