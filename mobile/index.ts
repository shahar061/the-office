// MUST be the very first imports — polyfill Node globals that @noble/*
// and Buffer.from(...) calls in our shared code rely on. React Native
// doesn't expose these by default.
import 'react-native-get-random-values';
import { Buffer } from 'buffer';
(globalThis as any).Buffer = Buffer;

import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
