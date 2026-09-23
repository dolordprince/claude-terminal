export const join = (...a) => a.join("/");
export const resolve = (...a) => a.join("/");
export const dirname = (p) => p.split("/").slice(0, -1).join("/");
export const basename = (p) => p.split("/").pop();
export default { join, resolve, dirname, basename };
