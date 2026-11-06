import { MD3DarkTheme, MD3LightTheme } from 'react-native-paper';

/** Paper scales most shapes from this: buttons and segmented buttons by 5, cards by 3, text inputs by 1. */
const ROUNDNESS = 3;

export const lightTheme = { ...MD3LightTheme, roundness: ROUNDNESS };
export const darkTheme = { ...MD3DarkTheme, roundness: ROUNDNESS };

/** Gives outlined text inputs the same corner radius as buttons. */
export const INPUT_THEME = { roundness: 5 * ROUNDNESS };

/** Widest the app gets on a desktop browser. */
export const MAX_CONTENT_WIDTH = 640;
