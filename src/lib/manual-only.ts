/** No environment variable can turn providers on in this release. */
export function disabled(feature: string): never {
  throw new Error(feature + ' is disabled in the manual Acquisition release. Use the reviewed workspace workflow.');
}
