declare module "detectincognitojs" {
  export function detectIncognito(): Promise<{ isPrivate: boolean; browserName: string }>;
}
