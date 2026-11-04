// Dev only (?xr on the dev server): a simulated Quest 3, so XR code can be exercised in a browser.
// Vite drops this file from production builds: main.js only imports it under import.meta.env.DEV.
import { XRDevice, metaQuest3 } from 'iwer';

export function installEmulator() {
  const device = new XRDevice(metaQuest3);
  device.installRuntime({ forceInstall: true }); // browsers with their own (empty) navigator.xr too
  window.xrDevice = device;
}
