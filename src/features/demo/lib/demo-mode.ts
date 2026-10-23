export function isLocalDemoEnabled(
  nodeEnvironment: string | undefined,
  demoFlag: string | undefined,
): boolean {
  if (nodeEnvironment !== "development") {
    return false;
  }

  if (demoFlag === undefined) {
    return true;
  }

  const normalizedFlag = demoFlag.trim().toLowerCase();
  return (
    normalizedFlag === "true" ||
    normalizedFlag === "1" ||
    normalizedFlag === "yes"
  );
}
