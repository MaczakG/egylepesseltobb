// A válasz után futó munkák (pl. e-mail értesítés). Lambdán a futtató a válasz előtt megvárja őket,
// mert a válasz után a folyamat befagy.
const pending = new Set();

export function track(promise) {
  pending.add(promise);
  promise.finally(() => pending.delete(promise));
  return promise;
}

export async function settle() {
  while (pending.size) await Promise.allSettled([...pending]);
}
