/** Completed years since date of birth (birthday not yet this year → one less). */
export function completedAgeYears(dob: Date): number {
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age;
}

export function isAtLeastAge(dob: Date, minYears: number): boolean {
  return completedAgeYears(dob) >= minYears;
}
