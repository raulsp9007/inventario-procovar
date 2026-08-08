export async function getData(key) {
  const raw = localStorage.getItem(key);
  return raw === null ? null : { value: raw };
}

export async function setData(key, value) {
  localStorage.setItem(key, value);
  return true;
}
