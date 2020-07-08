const { Airgram, Auth, toObject } = require('airgram');
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
 * @property {Airgram} Transport
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
            command: 'libtdjson',
            logVerbosityLevel: 2,

            phone: '',
            code: '',
            password: '',
            sessionStart: true,
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

        this.Transport = new Airgram(this.config);
    }

    isAvailable () {
        return typeof this.Transport === 'object';
    }

    async messageCallback (ctx) {
        // console.dir(ctx.update, {depth: 5});

        /** @type {Context} bcContext **/
        let bcContext = new this.BC.config.classes.Context(this.BC, this, ctx.update);

        let EVENTS = bcContext.Message.EVENTS;
        let event = '';
        let edited = false;
        let isBot = false;
        let chatType = 'user';
        let messageText = '';

        let chatId = 0;
        let senderId = 0;
        let messageId = 0;
        let messageDate = 0;


        switch (ctx.update._) {
            case 'updateNewMessage':
            // case 'updateMessageContent':
            // case 'updateChatLastMessage':
                let message = {};
                for (let type of ['message', 'messageContent', 'lastMessage']) {
                    if (type in ctx.update) {
                        message = ctx.update[type];
                        break;
                    }
                }
                // console.log(upd);
                console.log('MESSAGE CALLBACK. ID: ', message.id);
                messageId = message.id;
                messageText = this.MT.extract('content.text.text', message, '');
                messageDate = message.date;
                senderId = message.senderUserId;
                chatId = message.chatId;
                if (chatType < 0) {
                    chatType = message.isChannelPost ? 'channel' : 'chat';
                }

                break;
        }

        event = messageText !== ''
            ? (chatId < 0 ? EVENTS.CHAT_MESSAGE_NEW : EVENTS.MESSAGE_NEW)
            : '';

        bcContext.Message.chat = {
            id: chatId,
            type: chatType,
        };
        bcContext.Message.sender = {
            id: senderId,
            isBot,
        };
        bcContext.Message.id = messageId;
        bcContext.Message.date = messageDate;
        bcContext.Message.text = messageText;
        bcContext.Message.edited = edited;
        bcContext.Message.event = event;
        if (event !== '') {
            console.log('MESSAGE CALLBACK. MSG EVENT ', event, ' ID ', messageId);
            if (this.config.sessionStart === true) {
                let t = this;
                let SM = new SessionManager({bridge: t});
                // console.log(SM);
                return await SM.middleware()(ctx.update, () => {
                    bcContext.session = ctx.update.session;
                    return t.BC.handleUpdate(bcContext);
                });
            } else {
                // console.log(bcContext.session, ctx.update.session);
                bcContext.session = {};
                return this.BC.handleUpdate(bcContext);
            }
        }
    }

    listen () {
        this.Transport.use(async (ctx, next) => {
            if ('update' in ctx) {
                // console.log('TG PVT HANDLE UPDATE. CONSTRUCTOR ', ctx.update._, ' MSG ID ', this.MT.extract('update.message.id', ctx));
                // console.log(`[all updates][${ctx._}]`, JSON.stringify(ctx.update));
                await this.messageCallback(ctx);
            }
            return next()
        })
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


    async fetchUserInfo (userId, bcContext = null) {
        console.log('FETCH USER INFO. USER ID ', userId, ' CTX MSG ID ', this.MT.extract('Message.id', bcContext));
        let result = {id: userId};
        if (userId === this.BC.SELF_SEND || userId === 0 || userId === undefined) {
            result = {
                id: this.tgUser.id,
                username: this.tgUser.username,
                first_name: this.tgUser.first_name,
                last_name: this.tgUser.last_name,
            }
        } else {

            await Promise.all([
                (async () => this.Transport.api.getUser({userId})
                    .then(response => {
                        if (response.response._ === 'user') {
                            result.username = response.response.username;
                            result.first_name = response.response.firstName;
                            result.last_name = response.response.lastName;
                        }
                    }))(),
                (async () => this.Transport.api.getUserFullInfo({userId})
                    .then(response => {
                        console.log(response.response);
                        if (response.response._ === 'userFullInfo') {
                            result.bio = response.response.bio;
                        }
                    }))(),
            ]);
        }
        return result;
    }

    async fetchChatInfo (chatId, bcContext = null) {
        let result = {id: chatId};
        let response = await this.Transport.api.getChat({chatId})
            .catch((e) => console.error(e));
        if (response.response._ === 'chat') {
            let chat = response.response;
            result.title = chat.title;
            let chatType = 'user';
            switch (chat.type._) {
                case 'chatTypePrivate':
                    chatType = 'user';
                    break;
                case 'chatTypeBasicGroup':
                    chatType = 'chat';
                    break;
                case 'chatTypeSupergroup':
                    chatType = chat.type.isChannel ? 'channel' : 'chat';
                    await Promise.all([
                        (async () => this.Transport.api.getSupergroup({supergroupId: chat.type.supergroupId})
                            .then(response => {
                                // console.log(response.response);
                                if (response.response._ === 'supergroup') {
                                    result.username = response.response.username;
                                }
                            }))(),
                        (async () => this.Transport.api.getSupergroupFullInfo({supergroupId: chat.type.supergroupId})
                            .then(response => {
                                // console.log(response.response);
                                if (response.response._ === 'supergroupFullInfo') {
                                    result.description = response.response.description;
                                }
                            }))(),
                    ]);

                    break;
                case 'chatTypeSecret':
                    chatType = 'user';
                    break;
            }
            result.type = chatType;
            console.log('FETCHED CHAT INFO .', result);
        }
        return result;
    }

    launch = async (middleware, ...middlewares) => {
        await this.Transport.use(new Auth({
            code: () => this.config.code,
            phoneNumber: () => this.config.phone
        }));
        this.getMe();
    }

    getMe = async () => {
        let response = await this.Transport.api.getMe();
        if (response.response._ === 'user') {
            this.tgUser = {
                id: response.response.id,
                username: response.response.username,
                first_name: response.response.first_name,
                last_name: response.response.last_name,
            }
        }
    }

    setOnline = async () => {
        await this.Transport.call('account.updateStatus', {offline: false});
        setTimeout(this.setOnline, 5000);
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