// For security-sensitive steps (password checks, OTP verification), we don't want
// to echo back the server's specific reason (e.g. "OTP expired" vs "OTP incorrect" vs
// "no such user") — that kind of detail helps an attacker narrow down what went wrong.
// Real banking apps just say the attempt was invalid and let you retry.
//
// Ordinary form-validation problems (insufficient balance, empty amount, etc.) are NOT
// routed through this — the user typed something and deserves a specific, actionable
// message for those.
export const INVALID_ATTEMPT_MESSAGE = "Invalid attempt. Please try again.";
