const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');


class SessionManager {
    constructor(config = {}) {
        this.adapter = new FileSync(config.storage || this.defaults.storage);
        this.store = low(this.adapter);
        this.serviceKeys = ['__wrapped__', '__actions__', '__chain__', '__index__', '__values__', '$forceUpdate'];

        // this.Bridge = config.bridge || {};
        this.contextKey = config.contextKey || 'session';
        this.getStorageKey = config.getStorageKey || (context => (String(context.thread_id) + ':' + String(context.user_id)));
        this.storage = config.storage || {
            set: (key, value) => this.storeSet(key, value),
            get: (key) => this.storeGet(key),
            delete: (key) => this.storeSet(key, {}),
        };
        // }
        /**
         * Returns the middleware for embedding
         */
        // get middleware() {
        this.middleware = () => {
            const {storage, contextKey, getStorageKey} = this;
            return async (context, next) => {
                // console.log(context);
                const storageKey = getStorageKey(context);
                console.log(storageKey);
                let changed = false;
                const wrapSession = (targetRaw) => (
                    // eslint-disable-next-line no-use-before-define
                    new Proxy({...targetRaw, $forceUpdate}, {
                        set: (target, prop, value) => {
                            changed = true;
                            target[prop] = value;
                            return true;
                        },
                        deleteProperty(target, prop) {
                            changed = true;
                            delete target[prop];
                            return true;
                        }
                    }));
                const $forceUpdate = () => {
                    // eslint-disable-next-line no-use-before-define
                    if (Object.keys(session).length > 1) {
                        changed = false;
                        // eslint-disable-next-line no-use-before-define
                        return storage.set(storageKey, session);
                    }
                    return storage.delete(storageKey);
                };
                const initialSession = await storage.get(storageKey) || {};
                let session = wrapSession(initialSession);
                Object.defineProperty(context, contextKey, {
                    get: () => session,
                    set: (newSession) => {
                        console.log('DEFAULT SESSION MANAGER SET. NEW SESSION: ', newSession);
                        session = wrapSession(newSession);
                        changed = true;
                    }
                });
                await next();
                if (!changed) {
                    return;
                }
                await $forceUpdate();
            };
        }
    }

    storeGet (key) {
        // console.log('BOTCMS DRIVER STORE GET. KEY ' + key);
        let value = this.store.get(key) || null;
        return value.__wrapped__[key];
    }

    storeSet (key, value) {
        let primitive = {};
        // console.log('BOTCMS DRIVER STORE SET ' + key + ', VALUE ', value);
        for (let k in value) {
            if (value.hasOwnProperty(k) && this.serviceKeys.indexOf(k) === -1) {
                primitive[k] = value[k];
                // console.log('BOTCMS INSTAGRAM DRIVER STORE SET ' + k + ' VALUE ', value[k]);
            }
        }
        // console.log('BOTCMS INSTAGRAM DRIVER STORE SET ' + key + ' FINAL VALUE ', primitive);
        this.store.set(key, primitive).write();
        // console.log('BOTCMS INSTAGRAM DRIVER STORE SET ' + key /*+ ', ALL ', this.store*/);
        return true;
    }
}

module.exports = SessionManager;