const { Airgram, Auth } = require('airgram')
const Context = require('botcms/lib/context')

/** TelegramPrivate driver
 * @class
 *
 * @property {Object} defaults
 * @property {string} driverName
 * @property {string} name
 *
 * @property {Object<import('botcms')>} BC
 * @property {Object<import('mvtools')>} BC.MT
 * @property {Airgram} Transport
 */

class TelegramPrivate {

  config = {}
  BC = null

  constructor (BC, params = {}) {
    this.BC = BC
    this.MT = this.BC.MT
    this.defaults = {
      name: 'tgpvt',
      driverName: 'tgpvt',
      humanName: 'TelegramPrivate',
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
      alwaysOnline: false,
      useFileDatabase: true,
      useChatInfoDatabase: true,
      useMessageDatabase: true
      // sessionHandler: SessionManager,
    }
    this.config = this.BC.MT.mergeRecursive(this.defaults, params)
    this.name = this.config.name
    this.driverName = this.config.driverName
    this.humanName = this.config.humanName
    this.user = {
      'id': 0,
      'name': '',
      'username': '',
    }
    this.pendingIds = {}

    this.Transport = new Airgram(this.config)
    // console.log(this.config)

    this.waitServerId = async (oldId) => {
      if (this.pendingIds[oldId] !== undefined) {
        let newId = this.pendingIds[oldId]
        delete this.pendingIds[oldId]
        return newId
      } else {
        await this.MT.sleep(5)
        return this.waitServerId(oldId)
      }
    }
  }

  /* @deprecated */
  get tgUser () {
    return this.user
  }

  /* @deprecated */
  set tgUser (user) {
    this.user = user
  }

  isAvailable () {
    return typeof this.Transport === 'object'
  }

  async messageCallback (ctx) {
    // console.dir(ctx.update, {depth: 5});

    let ctxConfig = {
      useSession: this.config.sessionStart
    }
    /** @type {Context} bcContext **/
    let bcContext = new this.BC.config.classes.Context(this.BC, this, ctx.update, ctxConfig)

    let EVENTS = bcContext.Message.EVENTS
    let event = ''
    let edited = false
    let isBot = false
    let chatType = 'user'
    let messageText = ''

    let chatId = 0
    let senderId = 0
    let messageId = 0
    let messageIds = []
    let messageDate = 0
    let replyId = 0

    let message = {}
    switch (ctx.update._) {
      case 'updateNewMessage':
        // case 'updateMessageContent':
        // case 'updateChatLastMessage':
        for (let type of ['message', 'messageContent', 'lastMessage']) {
          if (type in ctx.update) {
            message = ctx.update[type]
            break
          }
        }
        // console.log(upd);
        // console.log('MESSAGE CALLBACK. ID: ', message.id);
        messageId = message.id
        messageText = this.MT.extract('content.text.text', message, '')
        messageDate = message.date
        senderId = message.sender.userId === this.tgUser.id ?
          this.BC.SELF_SEND :
          (message.sender._ === 'messageSenderUser' ? message.sender.userId : 0)
        chatId = message.chatId
        if (parseInt(chatId) < 0) {
          chatType = message.isChannelPost ? 'channel' : 'chat'
        }
        if (message.replyToMessageId) {
          replyId = message.replyToMessageId
        }
        let fwSenderId = this.BC.MT.extract('forwardInfo.origin.senderUserId', message, 0)
        if (fwSenderId) {
          bcContext.Message.handleForwarded({
            sender: {
              id: fwSenderId,
            },
            date: this.BC.MT.extract('forwardInfo.date', message, 0)
          })
          bcContext.Message.author.id = fwSenderId
        }
        switch (message.content._) {
          case 'messagePhoto':
            // console.dir(message.content.photo, {depth: 5});
            messageText = this.MT.extract('content.caption.text', message, '')
            let sizes = {}
            for (let size of message.content.photo.sizes) {
              sizes[size.type] = size
            }
            let attachment
            for (let type of ['w', 'y', 'x', 'm', 's', 'd', 'c', 'b', 'a']) {
              if (type in sizes) {
                attachment = {
                  type: this.BC.ATTACHMENTS.PHOTO,
                  id: sizes[type].photo.remote.uniqueId,
                  width: sizes[type].width,
                  height: sizes[type].height,
                  fileSize: sizes[type].photo.size
                }
                break
              }
            }
            bcContext.Message.handleAttachment(attachment)
        }
        // console.log(bcContext.Message.forwarded);
        // console.log(bcContext.Message.attachments.photo);

        break

      case 'updateDeleteMessages':
        if (ctx.update.fromCache) {
          return
        }
        for (let type of ['updateDeleteMessages']) {
          if (type in ctx.update) {
            message = ctx.update[type]
            break
          }
        }
        // console.log(ctx.update, message)
        // console.log(upd);
        // console.log('MESSAGE CALLBACK. ID: ', message.id);
        messageId = ctx.update.messageIds[0]
        messageIds = ctx.update.messageIds
        messageText = ''
        messageDate = Math.round(Date.now() / 1000)
        senderId = ctx.update.senderUserId || 0
        chatId = ctx.update.chatId
        event = EVENTS.MESSAGE_REMOVE
        if (parseInt(chatId) < 0) {
          chatType = ctx.update.isChannelPost ? 'channel' : 'chat'
          event = EVENTS.CHAT_MESSAGE_REMOVE
        }
    }

    if (event === '' && messageText !== '') {
      event = chatId < 0 ? EVENTS.CHAT_MESSAGE_NEW : EVENTS.MESSAGE_NEW
    }

    bcContext.Message.chat = {
      id: chatId,
      type: chatType,
    }
    bcContext.Message.sender = {
      id: senderId,
      isBot,
    }
    bcContext.Message.id = messageId
    bcContext.Message.ids = messageIds
    bcContext.Message.date = messageDate
    bcContext.Message.text = messageText
    bcContext.Message.edited = edited
    bcContext.Message.event = event
    bcContext.Message.reply.id = replyId
    let result
    if (event !== '') {
      // console.log('MESSAGE CALLBACK. MSG EVENT ', event, ' ID ', messageId);
      result = bcContext.process()
    }
    if (this.config.readProcessed && chatId && messageId) {
      this.Transport.api.viewMessages({
        chatId,
        messageIds: [messageId],
        forceRead: true,
      }).then(/*(res) => console.log(res)*/)
    }
    return result
  }

  listen () {
    this.Transport.use(async (ctx, next) => {
      if ('update' in ctx) {
        // console.log('TG PVT HANDLE UPDATE. CONSTRUCTOR ', ctx.update._, ' MSG ID ', this.MT.extract('update.message.id', ctx));
        // console.log(`[all updates][${ctx._}]`, JSON.stringify(ctx.update));
        let oldId = 0
        if (ctx.update._ === 'updateMessageSendSucceeded') {
          // console.log('UPDATE MESSAGE SEND SUCCEEDED', ctx.update)
          ctx.update._ = 'updateNewMessage'
          oldId = ctx.update.oldMessageId
        }
        if (ctx.update._ === 'updateMessageSendFailed') {
          oldId = ctx.update.oldMessageId
        } else {
          let state = this.MT.extract('message.sendingState', ctx.update, null)
          // console.log('SENDING STATE', state, )
          if (!state) {
            await this.messageCallback(ctx)
          }
        }
        if (oldId) {
          this.pendingIds[oldId] = ctx.update.message.id
        }
      }
      return next()
    })
  }

  kbBuild (keyboard, recursive = false) {
    return []
  }

  kbRemove (ctx) {
    console.log('[TGPVT] KB REMOVE')
    return []
  }

  reply (ctx, Parcel) {
    return this.send(Parcel)
  }

  async send (parcel) {
    // console.log('TG PVT SEND MESSAGE. IN DATA ', parcel);

    let text = {
      _: 'formattedText',
      text: parcel.message,
    }
    if (typeof parcel.message === 'object') {
      let parseMode = { _: 'textParseModeHTML' }
      if (parcel.message.markup === 'md') {
        parseMode = { _: 'textParseModeMarkdown', version: 2 }
      }
      const format = await this.Transport.api.parseTextEntities({ text: parcel.message.text, parseMode })
      if (format.response._ === 'formattedText') {
        text = format.response
      } else {
        console.error('TG PVT. ERROR PARSE FORMATTED TEXT:', format.response.message)
        console.error('TG PVT. PARSE REQUEST TEXT', format.request.params.text)
      }
    }

    let ids = []
    let content = { _: 'inputMessageText', text }

    if (parcel.fwChatId !== '' && parcel.fwChatId !== 0 && parcel.fwChatId !== null) {
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

    }

    let method = 'sendMessage'
    let waitId = true
    if (parcel.editMsgId !== 0 && parcel.editMsgId !== undefined) {
      waitId = false
      await this.Transport.api.getMessage({
        messageId: parseInt(parcel.editMsgId),
        chatId: parcel.peerId
      })
      // console.log('GET MESSAGE RESPONSE')
      // console.dir(getMsgResponse.response.messages, {depth: 5})
      method = 'editMessageText'
      params.messageId = parcel.editMsgId
    }

    // console.log('TG PVT. SEND PARAMS', params);

    let response = await this.Transport.api[method](params).catch((e) => {
      console.error('ERROR IN TG PVT', this.name, 'WHILE', method, ':', e)
      return { response: {} }
    })
    // console.log('TG PVT. SEND. FIRST SEND. RESPONSE: ', response.response);
    if (response.response._ !== 'error') {
      let id = response.response.id
      if (waitId) {
        id = await this.waitServerId(id)
      }
      ids.push(id)
    } else if (response.response.code === 5 && parseInt(parcel.peerId) > 0) {
      response = await this.Transport.api.createPrivateChat({ userId: parcel.peerId })
      // console.log('TG PVT. CREATE PRIVATE CHAT RESPONSE', response.response);
      if (response.response._ !== 'error') {
        await this.BC.MT.sleep(500)
        return await this.send(parcel)
      } else {
        console.error('TG PVT. SEND ERROR. CREATE PRIVATE CHAT RESPONSE:')
        console.dir(response, { depth: 5 })
      }
    } else {
      console.error('TG PVT. SEND ERROR. FIRST SEND MESSAGE RESPONSE:')
      console.dir(response, { depth: 5 })
    }
    // console.log('TG PVT SENT MESSAGES: ');
    // console.dir(response.response, {depth: 5});

    return ids

  }

  async fetchUserInfo (userId, bcContext = null) {
    // console.log('FETCH USER INFO. USER ID ', userId, ' CTX MSG ID ', this.MT.extract('Message.id', bcContext));
    let result = { id: userId }
    if (userId === this.BC.SELF_SEND || userId === 0 || userId === undefined) {
      result = {
        id: this.tgUser.id,
        username: this.tgUser.username,
        first_name: this.tgUser.first_name,
        last_name: this.tgUser.last_name,
      }
    } else {

      await Promise.all([
        (async () => this.Transport.api.getUser({ userId })
          .then(response => {
            if (response.response._ === 'user') {
              result.username = response.response.username
              result.first_name = response.response.firstName
              result.last_name = response.response.lastName
            }
          }))(),
        (async () => this.Transport.api.getUserFullInfo({ userId })
          .then(response => {
            // console.log(response.response);
            if (response.response._ === 'userFullInfo') {
              result.bio = response.response.bio
            }
          }))(),
      ])
    }
    return result
  }

  async fetchChatInfo (chatId, bcContext = null) {
    let result = { id: chatId }
    let response = await this.Transport.api.getChat({ chatId })
      .catch((e) => console.error(e))
    if (response.response._ === 'chat') {
      let chat = response.response
      result.title = chat.title
      let chatType = 'user'
      switch (chat.type._) {
        case 'chatTypePrivate':
          chatType = 'user'
          break
        case 'chatTypeBasicGroup':
          chatType = 'chat'
          break
        case 'chatTypeSupergroup':
          chatType = chat.type.isChannel ? 'channel' : 'chat'
          await Promise.all([
            (async () => this.Transport.api.getSupergroup({ supergroupId: chat.type.supergroupId })
              .then(response => {
                // console.log(response.response);
                if (response.response._ === 'supergroup') {
                  result.username = response.response.username
                }
              }))(),
            (async () => this.Transport.api.getSupergroupFullInfo({ supergroupId: chat.type.supergroupId })
              .then(response => {
                // console.log(response.response);
                if (response.response._ === 'supergroupFullInfo') {
                  result.description = response.response.description
                }
              }))(),
          ])

          break
        case 'chatTypeSecret':
          chatType = 'user'
          break
      }
      result.type = chatType
      // console.log('FETCHED CHAT INFO .', result);
    }
    return result
  }

  launch = async () => {
    await this.Transport.use(new Auth({
      code: () => this.config.code,
      phoneNumber: () => this.config.phone,
      password: () => this.config.password,
    }))
    await this.getMe()
    await this.Transport.api.getChats({
      chatList: { _: 'chatListMain' },
      limit: 500,
    })
    if (this.config.alwaysOnline) {
      this.setOnline()
    }
    console.debug('TGPVT ' + this.name + ' STARTED')
  }

  getMe = async () => {
    let response = await this.Transport.api.getMe()
    if (response.response._ === 'user') {
      this.tgUser = {
        id: response.response.id,
        username: response.response.username,
        first_name: response.response.firstName,
        last_name: response.response.lastName,
      }
      console.log(this.tgUser)
    } else {
      console.error('TG PVT', this.name, '. GET ME ERROR', response)
    }
  }

  setOnline = async () => {
    await this.Transport.api.setOption({
      name: 'online',
      value: {
        _: 'optionValueBoolean',
        value: true
      }
    })
    setTimeout(this.setOnline, 5000)
  }

  sendCode (phone) {
    if (this.config.phoneCodeHash === '') {
      return this.Transport.call('auth.sendCode', {
        phone_number: phone,
        settings: {
          _: 'codeSettings',
        },
      })
    } else {
      return Promise.resolve({
        phone_code_hash: this.config.phoneCodeHash,
      })
    }
  }

}

module.exports = Object.assign(TelegramPrivate, { Instagram: TelegramPrivate })
module.exports.default = Object.assign(TelegramPrivate, { Instagram: TelegramPrivate })