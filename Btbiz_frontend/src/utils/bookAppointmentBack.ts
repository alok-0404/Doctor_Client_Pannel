/** Lets the booking wizard handle one-step back before the global button leaves the page. */
let handler: (() => boolean) | null = null

export function setBookAppointmentBackHandler(next: (() => boolean) | null): void {
  handler = next
}

export function tryBookAppointmentBack(): boolean {
  return handler ? handler() : false
}
