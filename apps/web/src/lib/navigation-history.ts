/** The previous in-app location (path + query + hash), like `document.referrer` for a SPA. */
let previousLocation: string | null = null;
let currentLocation: string | null = null;

export function trackLocation(location: string): void {
  if (location === currentLocation) return;
  previousLocation = currentLocation;
  currentLocation = location;
}

export function getPreviousLocation(): string | null {
  return previousLocation;
}
