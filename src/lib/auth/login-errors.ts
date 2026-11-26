/** Public classifications only. Do not copy provider/database error details into login UI. */
export const LOGIN_UNAVAILABLE_CODE = 'temporarily_unavailable'
export const LOGIN_UNAVAILABLE_MESSAGE = 'Sign-in is temporarily unavailable. Please try again shortly.'
export function loginFailureMessage(result?: { error?: string | null; code?: string | null }): string {
  return result?.error === 'CredentialsSignin' && (!result.code || result.code === 'credentials')
    ? 'Invalid email or password. Please try again.' : LOGIN_UNAVAILABLE_MESSAGE
}
