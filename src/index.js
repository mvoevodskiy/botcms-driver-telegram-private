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
            readProcessed: true,
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
        console.log(this.config);
    }

    isAvailable () {
        return typeof this.Transport === 'object';
    }

    async messageCallback (ctx) {
        console.dir(ctx.update, {depth: 5});

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
                // console.log('MESSAGE CALLBACK. ID: ', message.id);
                messageId = message.id;
                messageText = this.MT.extract('content.text.text', message, '');
                messageDate = message.date;
                senderId = message.senderUserId;
                chatId = message.chatId;
                if (parseInt(chatId) < 0) {
                    chatType = message.isChannelPost ? 'channel' : 'chat';
                }
                let fwSenderId = this.BC.MT.extract('forwardInfo.origin.senderUserId', message, 0);
                if (fwSenderId) {
                    bcContext.Message.handleForwarded({
                        sender: {
                            id: fwSenderId,
                        },
                        date: this.BC.MT.extract('forwardInfo.date', message, 0)
                    });
                }
                // console.log(bcContext.Message.forwarded);

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
        let result;
        if (event !== '') {
            // console.log('MESSAGE CALLBACK. MSG EVENT ', event, ' ID ', messageId);
            if (this.config.sessionStart === true) {
                let t = this;
                let SM = new SessionManager({bridge: t});
                // console.log(SM);
                result = await SM.middleware()(ctx.update, async () => {
                    bcContext.session = ctx.update.session;
                    await t.BC.handleUpdate(bcContext);
                });
            } else {
                // console.log(bcContext.session, ctx.update.session);
                bcContext.session = {};
                result = await this.BC.handleUpdate(bcContext);
            }
        }
        if (this.config.readProcessed && chatId && messageId) {
            this.Transport.api.viewMessages({
                chatId,
                messageIds: [messageId],
                forceRead: true,
            }).then((res) => console.log(res));
        }
        return result;
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

    async send (parcel) {
        // console.log('TG PVT SEND MESSAGE. IN DATA ', parcel);

        let ids = [];
        let content = {
            _: 'inputMessageText',
            text: {
                _: 'formattedText',
                text: parcel.message,
            }
        };

        if (parcel.fwdChatId !== '' && parcel.fwdChatId !== 0 && parcel.fwdChatId !== null) {
            content = {
                _: 'inputMessageForwarded',
                fromChatId: parseInt(parcel.fwChatId),
                messageId: parseInt(parcel.fwMsgIds[0]),
                sendCopy: false,
            }
        }
        let params = {
            chatId: parcel.peerId,
            replyToMessageId: parcel.replyMsgId,
            inputMessageContent: content,

        };

        // console.log('TG PVT. SEND PARAMS', params);

        let response = await this.Transport.api.sendMessage(params);
        // console.log('TG PVT. SEND. FIRST SEND. RESPONSE: ', response.response);
        if (response.response._ !== 'error') {
            ids.push(response.response.id);
        } else if (response.response.code === 5 && parseInt(parcel.peerId) > 0) {
            response = await this.Transport.api.createPrivateChat({userId: parcel.peerId});
            // console.log('TG PVT. CREATE PRIVATE CHAT RESPONSE', response.response);
            if (response.response._ !== 'error') {
                await this.BC.MT.sleep(500);
                return await this.send(parcel);
            } else {
                console.error('TG PVT. SEND ERROR. CREATE PRIVATE CHAT RESPONSE:');
                console.dir(response, {depth: 5});
            }

        } else {
            console.error('TG PVT. SEND ERROR. FIRST SEND MESSAGE RESPONSE:');
            console.dir(response, {depth: 5});
        }
        // console.log('TG PVT SENT MESSAGES: ');
        // console.dir(response.response, {depth: 5});

        return ids;

    }


    async fetchUserInfo (userId, bcContext = null) {
        // console.log('FETCH USER INFO. USER ID ', userId, ' CTX MSG ID ', this.MT.extract('Message.id', bcContext));
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
                        // console.log(response.response);
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
            // console.log('FETCHED CHAT INFO .', result);
        }
        return result;
    }

    launch = async (middleware, ...middlewares) => {
        await this.Transport.use(new Auth({
            code: () => this.config.code,
            phoneNumber: () => this.config.phone,
            password: () => this.config.password,
        }));
        await this.Transport.api.getChats({
            chatList: {_: 'chatListMain'},
            limit: 500,
        })
        console.debug('TGPVT ' + this.name + ' STARTED');
        this.getMe();
    }

    getMe = async () => {
        let response = await this.Transport.api.getMe();
        if (response.response._ === 'user') {
            this.tgUser = {
                id: response.response.id,
                username: response.response.username,
                first_name: response.response.firstName,
                last_name: response.response.lastName,
            }
            console.log(this.tgUser);
        } else {
            console.error('TG PVT', this.name, '. GET ME ERROR', response);
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