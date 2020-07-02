const { MTProto } = require('@mtproto/core');
const Context = require('botcms/lib/context');
const BotCMS = require('botcms');
const SessionManager = require('./sessionmanager');


/** TelegramPrivate driver
 * @class
 *
 * @property {Object} defaults
 * @property {string} driverName
 * @property {string} name
 *
 * @property {BotCMS} BC
 * @property {MTProto} Transport
 */

class TelegramPrivate {

    config = {};
    /** @type {BotCMS} */
    BC = null;

    constructor (BC, params = {}) {
        this.BC = BC;
        this.MT = this.BC.MT;
        this.defaults = {
            name: 'tgpvt',
            driverName: 'tgpvt',
            humanName: 'TelegramPrivate',
            storage: 'telegram_private_db.json',
            apiId: '1231858',
            apiHash: '43cfa584b32fbccb43cc89e636c3dc75',
            testMode: false,

            phone: '',
            code: '',
            password: '',
            phoneCodeHash: '',
            sessionStart: true,
            shortUpdates: ['updateShortMessage', 'updateShortChatMessage', 'updateShort', 'updateShortSentMessage'],
            // sessionHandler: SessionManager,
        };
        this.config = this.BC.MT.mergeRecursive(this.defaults, params);
        this.name = this.config.name;
        this.driverName = this.config.driverName;
        this.humanName = this.config.humanName;
        this.user = {
            'id': 0,
            'name': '',
            'username': '',
        };

        this.Transport = new MTProto({
            api_id: this.config.apiId,
            api_hash: this.config.apiHash,
            test: this.config.testMode,
        });

        // this.Transport.updates.on('message', (new sessionHandler(sessionParams)).middleware);
    }

    isAvailable () {
        return typeof this.Transport === 'object';
    }

    on (feed, middleware) {
        // this.feeds[feed] = this.feeds[feed] || [];
        // this.feeds[feed].push(middleware);
    }

    async messageCallback (update) {
        // console.dir(update, {depth: 5});

        /** @type {Context} bcContext **/
        let bcContext = new this.BC.config.classes.Context(this.BC, this, update);

        let EVENTS = bcContext.Message.EVENTS;
        let event = '';
        let edited = false;
        let isBot = false;
        let chatType = 'user';
        let chatUsername = '';
        let chatFullname = '';
        let chatHash = '';
        let senderHash = '';
        let messageText = '';

        let chatId = 0;
        let senderId = 0;
        let messageId = 0;
        let messageDate = 0;


        switch (update._) {
            case 'updates':
                let upd = update.updates[0];
                if (!('message' in upd)) {
                    return;
                }
                // console.log(upd);
                messageId = upd.message.id;
                messageText = upd.message.message;
                messageDate = upd.message.date;
                senderId = upd.message.from_id;
                switch (upd.message.to_id._) {
                    case 'peerUser':
                        chatType = 'user';
                        chatId = upd.message.from_id;
                        break;

                    case 'peerChat':
                        chatType = 'chat';
                        chatId = -1 * upd.message.to_id.chat_id;
                        break;

                    case 'peerChannel':
                        chatType = 'channel';
                        chatId = -1 * upd.message.to_id.channel_id;
                        chatHash = this.MT.extract('chats.0.access_hash', update, '');

                        break;
                }
                for (let chat of update.chats) {
                    if (chat.id === chatId) {
                        chatUsername = this.MT.extract('username', chat, '');
                        chatFullname = this.MT.extract('title', chat, '');
                        if (chat._ === 'channel' && this.MT.extract('pFlags.megagroup', chat, false)) {
                            chatType = 'chat';
                        }
                        chatHash = chat.access_hash;
                        break;
                    }
                }
                let user = this.MT.extract('users.0', update, false);
                if (user) {
                    senderHash = user.access_hash;
                    if (upd.message.to_id._ === 'peerUser') {
                        chatHash = senderHash;
                    }
                }

                // console.log('USER HASH ', senderHash, ' CHAT HASH ', chatHash);

                break;

            case 'updateShort':
            case 'updateShortMessage':
            case 'updateShortChatMessage':
            case 'updateShortSentMessage':
                if (!('message' in update)) {
                    return;
                }
                messageText = update.message;
                messageId = update.id;
                messageDate = update.date;
                senderId = update.user_id || update.from_id;
                chatId = update.user_id;

                if (update.chat_id !== undefined) {
                    chatType = 'chat';
                    chatId = -1 * update.chat_id;
                }

        }

        event = messageText !== ''
            ? (chatId < 0 ? EVENTS.CHAT_MESSAGE_NEW : EVENTS.MESSAGE_NEW)
            : '';

        bcContext.Message.chat = {
            id: chatId,
            type: chatType,
            accessHash: chatHash,
        };
        bcContext.Message.sender = {
            id: senderId,
            isBot,
            accessHash: senderHash,
        };
        bcContext.Message.id = messageId;
        bcContext.Message.date = messageDate;
        bcContext.Message.text = messageText;
        bcContext.Message.edited = edited;
        bcContext.Message.event = event;
        if (this.config.sessionStart === true) {
            let t = this;
            let SM = new SessionManager({bridge: t});
            // console.log(SM);
            return await SM.middleware()(update, () => {
                bcContext.session = update.session;
                return t.BC.handleUpdate(bcContext);
            });
        } else {
            // console.log(bcContext.session, update.session);
            bcContext.session = {};
            return this.BC.handleUpdate(bcContext);
        }
    }

    listen () {
        // this.on('directInbox', this.readInbox);
        // this.on('directPending', this.readInbox);
        this.Transport.updates.on('updates', (message) => {return this.messageCallback(message)});
        this.Transport.updates.on('updatesTooLong', (message) => {return this.messageCallback(message)});
        this.Transport.updates.on('updateShortMessage', (message) => {return this.messageCallback(message)});
        this.Transport.updates.on('updateShortChatMessage', (message) => {return this.messageCallback(message)});
        this.Transport.updates.on('updateShort', (message) => {return this.messageCallback(message)});
        this.Transport.updates.on('updatesCombined', (message) => {return this.messageCallback(message)});
        this.Transport.updates.on('updateShortSentMessage', (message) => {return this.messageCallback(message)});
    }

    kbBuild (keyboard, recursive = false) {
        let kb = [];
        return kb;
    }

    kbRemove (ctx) {
        console.log('[TGPVT] KB REMOVE');
        return [];
    }

    reply (ctx, Parcel) {
        return this.send(Parcel);
    }

    async send (Parcel) {

    }


    async fetchUserInfo (user, bcContext = null) {
        let result = {id: user};
        if (user === this.BC.SELF_SEND || user === 0 || user === undefined) {
            result = {
                id: this.tgUser.id,
                username: this.tgUser.username,
                first_name: this.tgUser.first_name,
                last_name: this.tgUser.last_name,
            }
        } else {
            // console.log(typeof this);
            // console.log(typeof this.Telegram);
            // console.log("USER ID: %s, CHAT ID: %s", user, chatId);
            // if (this.BC.MT.empty(chatId)) {
            //     chatId = user;
            // }

            let hash = typeof bcContext === 'object' ? this.MT.extract('Message.sender.accessHash', bcContext, false) : bcContext;
            if (hash !== '') {

                let id = {
                    _: 'inputUser',
                    user_id: typeof user === 'object' ? user.id : user,
                    access_hash: hash,
                };
                // console.log('USERS.GETFULLUSER ID: ', id);
                let userInfo = await this.Transport.call('users.getFullUser', {id})
                    .catch((e) => console.error(e));
                // console.log('USERS.GETFULLUSER USERINFO: ', userInfo);
                if (!this.BC.MT.empty(userInfo)) {
                    let fullname = userInfo.user.last_name ? userInfo.user.first_name + ' ' + userInfo.user.last_name : userInfo.user.first_name;
                    result = {
                        id: userInfo.user.id,
                        username: userInfo.user.username,
                        first_name: userInfo.user.first_name,
                        last_name: userInfo.user.last_name,
                        full_name: fullname,
                        type: userInfo.user.is_bot ? 'bot' : 'user',
                    }
                }
            }
        }
        return result;
    }

    async fetchChatInfo (chatId, bcContext = null) {
        if (chatId > 0) {
            return this.fetchUserInfo(chatId, bcContext);
        }
        let result = {id: chatId};
        let params;
        let hash = typeof bcContext === 'object' ? this.MT.extract('Message.chat.accessHash', bcContext, false) : bcContext;
        if (hash) {
            params = {
                _: 'inputChannel',
                access_hash: hash,
                channel_id: chatId * -1,
            }
            let chatInfo = await this.Transport.call('channels.getFullChannel', {channel: params});
            // console.log('FETCH CHAT INFO. FROM TG: ', chatInfo);
            try {
                result = {
                    id: chatInfo.chats[0].id * -1,
                    username: chatInfo.chats[0].username || '',
                    accessHash: chatInfo.chats[0].access_hash || '',
                    title: chatInfo.chats[0].title || '',
                    description: chatInfo.full_chat.about || '',
                };
                // console.log('FETCH CHAT INFO .', result);
            } catch (e) {}
        }
        return result;
    }

    async launch(middleware, ...middlewares) {
        await this.Transport.call('users.getFullUser', {
            id: {
                _: 'inputUserSelf',
            },
        })
            .then(response => {
                // The user is logged in.
                // this.fetchUserInfo({id: 828553826, accessHash: '7066963861974490065'});

            })
            .catch(error => {

                this.sendCode(this.config.phone)
                    .catch(error => {
                        if (error.error_message.includes('_MIGRATE_')) {
                            const [type, nextDcId] = error.error_message.split('_MIGRATE_');

                            this.Transport.setDefaultDc(+nextDcId);

                            return this.sendCode(this.config.phone);
                        }
                    })
                    .then(result => {
                        // console.log('result 1: ', result);
                        // if (!this.MT.empty(result.user)) {
                        //     this.user = result.user;
                        //     return result;
                        // } else {
                        return this.Transport.call('auth.signIn', {
                            phone_code: this.config.code,
                            phone_number: this.config.phone,
                            phone_code_hash: result.phone_code_hash,
                        });
                        // }
                    })
                    .catch(error => {
                        if (error.error_message === 'SESSION_PASSWORD_NEEDED') {
                            return this.Transport.call('account.getPassword').then(async result => {
                                const {srp_id, current_algo, srp_B} = result;
                                const {salt1, salt2, g, p} = current_algo;

                                const {A, M1} = await getSRPParams({
                                    g,
                                    p,
                                    salt1,
                                    salt2,
                                    gB: srp_B,
                                    password: this.config.password,
                                });

                                return this.Transport.call('auth.checkPassword', {
                                    password: {
                                        _: 'inputCheckPasswordSRP',
                                        srp_id,
                                        A,
                                        M1,
                                    },
                                });
                            });
                        }
                    })
                    .then(result => {
                        // console.log('auth.authorization:', result);
                    });

            });
        await this.Transport.call('users.getFullUser', {id: {_: 'inputUserSelf'}}).then(response => {this.tgUser = response.user; console.log(response.user)});

    }

    sendCode(phone) {
        if (this.config.phoneCodeHash === '') {
            return this.Transport.call('auth.sendCode', {
                phone_number: phone,
                settings: {
                    _: 'codeSettings',
                },
            });
        } else {
            return Promise.resolve({
                phone_code_hash: this.config.phoneCodeHash,
            });
        }
    }


}


module.exports = Object.assign(TelegramPrivate, {Instagram: TelegramPrivate});
module.exports.default = Object.assign(TelegramPrivate, {Instagram: TelegramPrivate});