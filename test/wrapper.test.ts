/* eslint-disable @typescript-eslint/unbound-method */
import type { Event, EventEnvelope, EventItem, SeverityLevel } from '@sentry/types';
import { createEnvelope, logger } from '@sentry/utils';
import * as RN from 'react-native';

import type { Spec } from '../src/js/NativeRNSentry';
import type { ReactNativeOptions } from '../src/js/options';
import { utf8ToBytes } from '../src/js/vendor';
import { NATIVE } from '../src/js/wrapper';

jest.mock(
  'react-native',
  () => {
    let initPayload: ReactNativeOptions | null = null;

    const RNSentry: Spec = {
      addBreadcrumb: jest.fn(),
      captureEnvelope: jest.fn(),
      clearBreadcrumbs: jest.fn(),
      crash: jest.fn(),
      fetchNativeDeviceContexts: jest.fn(() =>
        Promise.resolve({
          someContext: {
            someValue: 0,
          },
        }),
      ),
      fetchNativeRelease: jest.fn(() =>
        Promise.resolve({
          build: '1.0.0.1',
          id: 'test-mock',
          version: '1.0.0',
        }),
      ),
      setContext: jest.fn(),
      setExtra: jest.fn(),
      setTag: jest.fn(),
      setUser: jest.fn(() => {
        return;
      }),
      initNativeSdk: jest.fn(options => {
        initPayload = options;

        return Promise.resolve(true);
      }),
      closeNativeSdk: jest.fn(() => Promise.resolve()),
      // @ts-ignore for testing.
      _getLastPayload: () => ({ initPayload }),
    };

    return {
      NativeModules: {
        RNSentry,
      },
      Platform: {
        OS: 'ios',
      },
    };
  },
  /* virtual allows us to mock modules that aren't in package.json */
  { virtual: true },
);

const RNSentry = RN.NativeModules.RNSentry as Spec;

const callAllScopeMethods = () => {
  NATIVE.addBreadcrumb({
    message: 'test',
    data: {
      map: { a: 1 },
      array: [1, 2, 3],
      unique: 123,
    },
  });
  NATIVE.clearBreadcrumbs();
  NATIVE.setUser({
    id: 'setUser',
  });
  NATIVE.setTag('key', 'value');
  NATIVE.setContext('key', {
    value: 'value',
    data: {
      map: { a: 1 },
      array: [1, 2, 3],
      unique: 123,
    },
  });
  NATIVE.setExtra('key', 'value');
};

beforeEach(() => {
  NATIVE.platform = 'ios';
  NATIVE.enableNative = true;
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('Tests Native Wrapper', () => {
  describe('startWithOptions', () => {
    test('calls native module', async () => {
      await NATIVE.initNativeSdk({ dsn: 'test', enableNative: true });

      expect(RNSentry.initNativeSdk).toBeCalled();
    });

    test('warns if there is no dsn', async () => {
      logger.warn = jest.fn();

      await NATIVE.initNativeSdk({ enableNative: true });

      expect(RNSentry.initNativeSdk).not.toBeCalled();
      expect(logger.warn).toHaveBeenLastCalledWith(
        'Warning: No DSN was provided. The Sentry SDK will be disabled. Native SDK will also not be initalized.',
      );
    });

    test('does not call native module with enableNative: false', async () => {
      logger.warn = jest.fn();

      await NATIVE.initNativeSdk({
        dsn: 'test',
        enableNative: false,
        enableNativeNagger: true,
      });

      expect(RNSentry.initNativeSdk).not.toBeCalled();
      expect(NATIVE.enableNative).toBe(false);
      expect(logger.warn).toHaveBeenLastCalledWith('Note: Native Sentry SDK is disabled.');
    });

    test('does not initialize with autoInitializeNativeSdk: false', async () => {
      NATIVE.enableNative = false;
      logger.warn = jest.fn();

      await NATIVE.initNativeSdk({
        dsn: 'test',
        enableNative: true,
        autoInitializeNativeSdk: false,
      });

      expect(RNSentry.initNativeSdk).not.toBeCalled();
      expect(NATIVE.enableNative).toBe(true);

      // Test that native bridge methods will go through
      callAllScopeMethods();
      expect(RNSentry.addBreadcrumb).toBeCalledWith({
        message: 'test',
        data: {
          map: { a: 1 },
          array: [1, 2, 3],
          unique: 123,
        },
      });
      expect(RNSentry.clearBreadcrumbs).toBeCalled();
      expect(RNSentry.setUser).toBeCalledWith(
        {
          id: 'setUser',
        },
        {},
      );
      expect(RNSentry.setTag).toBeCalledWith('key', 'value');
      expect(RNSentry.setContext).toBeCalledWith('key', {
        value: 'value',
        data: {
          map: { a: 1 },
          array: [1, 2, 3],
          unique: 123,
        },
      });
      expect(RNSentry.setExtra).toBeCalledWith('key', 'value');
    });

    test('enableNative: false takes precedence over autoInitializeNativeSdk: false', async () => {
      logger.warn = jest.fn();

      await NATIVE.initNativeSdk({
        dsn: 'test',
        enableNative: false,
        autoInitializeNativeSdk: false,
      });

      expect(RNSentry.initNativeSdk).not.toBeCalled();
      expect(NATIVE.enableNative).toBe(false);

      // Test that native bridge methods will NOT go through
      callAllScopeMethods();
      expect(RNSentry.addBreadcrumb).not.toBeCalled();
      expect(RNSentry.clearBreadcrumbs).not.toBeCalled();
      expect(RNSentry.setUser).not.toBeCalled();
      expect(RNSentry.setTag).not.toBeCalled();
      expect(RNSentry.setContext).not.toBeCalled();
      expect(RNSentry.setExtra).not.toBeCalled();
    });
  });

  describe('sendEnvelope', () => {
    test('calls only captureEnvelope', async () => {
      const event = {
        event_id: 'event0',
        message: 'test',
        sdk: {
          name: 'test-sdk-name',
          version: '2.1.3',
        },
      };

      const env = createEnvelope<EventEnvelope>({ event_id: event.event_id, sent_at: '123' }, [
        [{ type: 'event' }, event] as EventItem,
      ]);

      await NATIVE.sendEnvelope(env);

      expect(RNSentry.captureEnvelope).toBeCalledWith(
        utf8ToBytes(
          '{"event_id":"event0","sent_at":"123"}\n' +
            '{"type":"event","content_type":"application/json","length":87}\n' +
            '{"event_id":"event0","message":"test","sdk":{"name":"test-sdk-name","version":"2.1.3"}}\n',
        ),
        { store: false },
      );
    });
    test('serializes class instances', async () => {
      class TestInstance {
        value: number = 0;
        method = () => null;
      }

      const event = {
        event_id: 'event0',
        sdk: {
          name: 'test-sdk-name',
          version: '2.1.3',
        },
        instance: new TestInstance(),
      };

      const env = createEnvelope<EventEnvelope>({ event_id: event.event_id, sent_at: '123' }, [
        [{ type: 'event' }, event] as EventItem,
      ]);

      await NATIVE.sendEnvelope(env);

      expect(RNSentry.captureEnvelope).toBeCalledWith(
        utf8ToBytes(
          '{"event_id":"event0","sent_at":"123"}\n' +
            '{"type":"event","content_type":"application/json","length":93}\n' +
            '{"event_id":"event0","sdk":{"name":"test-sdk-name","version":"2.1.3"},"instance":{"value":0}}\n',
        ),
        { store: false },
      );
    });
    test('does not call RNSentry at all if enableNative is false', async () => {
      try {
        await NATIVE.initNativeSdk({ dsn: 'test-dsn', enableNative: false });

        // @ts-ignore for testing, does not accept an empty class.
        await NATIVE.sendEnvelope({});
      } catch (error) {
        // @ts-ignore it is an error but it does not know the type.
        expect(error.message).toMatch('Native is disabled');
      }
      expect(RNSentry.captureEnvelope).not.toBeCalled();
    });
    test('Encloses message to an object and not introduce empty breadcrumbs on Android', async () => {
      NATIVE.platform = 'android';

      const event: Event = {
        event_id: 'event0',
        message: 'test',
      };

      const env = createEnvelope<EventEnvelope>({ event_id: event.event_id as string, sent_at: '123' }, [
        [{ type: 'event' }, event] as EventItem,
      ]);

      await NATIVE.sendEnvelope(env);

      expect(RNSentry.captureEnvelope).toBeCalledWith(
        utf8ToBytes(
          '{"event_id":"event0","sent_at":"123"}\n' +
            '{"type":"event","content_type":"application/json","length":50}\n' +
            '{"event_id":"event0","message":{"message":"test"}}\n',
        ),
        { store: false },
      );
    });
    test('Clears breadcrumbs on Android if mechanism.handled is true', async () => {
      NATIVE.platform = 'android';

      const event: Event = {
        event_id: 'event0',
        exception: {
          values: [
            {
              mechanism: {
                handled: true,
                type: '',
              },
            },
          ],
        },
        breadcrumbs: [
          {
            message: 'crumb!',
          },
        ],
      };

      const env = createEnvelope<EventEnvelope>({ event_id: event.event_id as string, sent_at: '123' }, [
        [{ type: 'event' }, event] as EventItem,
      ]);

      await NATIVE.sendEnvelope(env);

      expect(RNSentry.captureEnvelope).toBeCalledWith(
        utf8ToBytes(
          '{"event_id":"event0","sent_at":"123"}\n' +
            '{"type":"event","content_type":"application/json","length":104}\n' +
            '{"event_id":"event0","exception":{"values":[{"mechanism":{"handled":true,"type":""}}]},"breadcrumbs":[]}\n',
        ),
        { store: false },
      );
    });
    test('Clears breadcrumbs on Android if there is no exception', async () => {
      NATIVE.platform = 'android';

      const event: Event = {
        event_id: 'event0',
        breadcrumbs: [
          {
            message: 'crumb!',
          },
        ],
      };

      const env = createEnvelope<EventEnvelope>({ event_id: event.event_id as string, sent_at: '123' }, [
        [{ type: 'event' }, event] as EventItem,
      ]);

      await NATIVE.sendEnvelope(env);

      expect(RNSentry.captureEnvelope).toBeCalledWith(
        utf8ToBytes(
          '{"event_id":"event0","sent_at":"123"}\n' +
            '{"type":"event","content_type":"application/json","length":38}\n' +
            '{"event_id":"event0","breadcrumbs":[]}\n',
        ),
        { store: false },
      );
    });
    test('Does not clear breadcrumbs on Android if mechanism.handled is false', async () => {
      NATIVE.platform = 'android';

      const event: Event = {
        event_id: 'event0',
        exception: {
          values: [
            {
              mechanism: {
                handled: false,
                type: '',
              },
            },
          ],
        },
        breadcrumbs: [
          {
            message: 'crumb!',
          },
        ],
      };

      const env = createEnvelope<EventEnvelope>({ event_id: event.event_id as string, sent_at: '123' }, [
        [{ type: 'event' }, event] as EventItem,
      ]);

      await NATIVE.sendEnvelope(env);

      expect(RNSentry.captureEnvelope).toBeCalledWith(
        utf8ToBytes(
          '{"event_id":"event0","sent_at":"123"}\n' +
            '{"type":"event","content_type":"application/json","length":125}\n' +
            '{"event_id":"event0","exception":{"values":[{"mechanism":{"handled":false,"type":""}}]},"breadcrumbs":[{"message":"crumb!"}]}\n',
        ),
        { store: true },
      );
    });
  });

  describe('fetchRelease', () => {
    test('fetches the release from native', async () => {
      await expect(NATIVE.fetchNativeRelease()).resolves.toMatchObject({
        build: '1.0.0.1',
        id: 'test-mock',
        version: '1.0.0',
      });
    });
  });

  describe('deviceContexts', () => {
    test('returns context object from native module on ios', async () => {
      NATIVE.platform = 'ios';

      await expect(NATIVE.fetchNativeDeviceContexts()).resolves.toMatchObject({
        someContext: {
          someValue: 0,
        },
      });

      expect(RNSentry.fetchNativeDeviceContexts).toBeCalled();
    });
    test('returns empty object on android', async () => {
      NATIVE.platform = 'android';

      await expect(NATIVE.fetchNativeDeviceContexts()).resolves.toMatchObject({});

      expect(RNSentry.fetchNativeDeviceContexts).not.toBeCalled();
    });
  });

  describe('isModuleLoaded', () => {
    test('returns true when module is loaded', () => {
      expect(NATIVE._isModuleLoaded(RNSentry)).toBe(true);
    });
  });

  describe('crash', () => {
    test('calls the native crash', () => {
      NATIVE.nativeCrash();

      expect(RNSentry.crash).toBeCalled();
    });
    test('does not call crash if enableNative is false', async () => {
      await NATIVE.initNativeSdk({ dsn: 'test-dsn', enableNative: false });
      NATIVE.nativeCrash();

      expect(RNSentry.crash).not.toBeCalled();
    });
  });

  describe('setUser', () => {
    test('serializes all user object keys', async () => {
      NATIVE.setUser({
        email: 'hello@sentry.io',
        // @ts-ignore Intentional incorrect type to simulate using a double as an id (We had a user open an issue because this didn't work before)
        id: 3.14159265359,
        unique: 123,
      });

      expect(RNSentry.setUser).toBeCalledWith(
        {
          email: 'hello@sentry.io',
          id: '3.14159265359',
        },
        {
          unique: '123',
        },
      );
    });

    test('Calls native setUser with empty object as second param if no unique keys', async () => {
      NATIVE.setUser({
        id: 'Hello',
      });

      expect(RNSentry.setUser).toBeCalledWith(
        {
          id: 'Hello',
        },
        {},
      );
    });
  });

  describe('_processLevel', () => {
    test('converts deprecated levels', () => {
      expect(NATIVE._processLevel('log' as SeverityLevel)).toBe('debug' as SeverityLevel);
    });
    test('returns non-deprecated levels', () => {
      expect(NATIVE._processLevel('debug' as SeverityLevel)).toBe('debug' as SeverityLevel);
      expect(NATIVE._processLevel('fatal' as SeverityLevel)).toBe('fatal' as SeverityLevel);
      expect(NATIVE._processLevel('info' as SeverityLevel)).toBe('info' as SeverityLevel);
      expect(NATIVE._processLevel('warning' as SeverityLevel)).toBe('warning' as SeverityLevel);
      expect(NATIVE._processLevel('error' as SeverityLevel)).toBe('error' as SeverityLevel);
    });
  });

  describe('closeNativeSdk', () => {
    NATIVE.enableNative = true;
    test('closeNativeSdk calls native bridge', async () => {
      await NATIVE.closeNativeSdk();

      expect(RNSentry.closeNativeSdk).toBeCalled();
      expect(NATIVE.enableNative).toBe(false);
    });
  });
});
