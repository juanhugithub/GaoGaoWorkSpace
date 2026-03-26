export const BUILD_APP_VERSION =
  typeof __APP_VERSION__ === "string" && __APP_VERSION__.trim()
    ? __APP_VERSION__.trim()
    : "";
