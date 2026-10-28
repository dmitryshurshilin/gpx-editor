const countFormat = new Intl.NumberFormat("ru-RU");
const distanceFormat = new Intl.NumberFormat("ru-RU", {
  maximumFractionDigits: 2,
});
export const formatCount = (value) => countFormat.format(value);
export const formatDistance = (value) =>
  `${distanceFormat.format(value / 1000)} км`;
