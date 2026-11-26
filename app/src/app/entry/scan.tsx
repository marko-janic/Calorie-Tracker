import { Redirect } from 'expo-router';

/** Scanning is Android only (scan.android.tsx). Other platforms have no scan button; a direct link goes to the day view. */
export default function ScanUnavailable() {
  return <Redirect href="/" />;
}
