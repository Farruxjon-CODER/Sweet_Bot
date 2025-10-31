require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');

const TOKEN = process.env.BOT_TOKEN;
const MONGODB_URI = process.env.MONGODB_URI;
const ADMIN_ID = process.env.ADMIN_ID && Number(process.env.ADMIN_ID);
const LANG_DEFAULT = process.env.LANG_DEFAULT || 'uz';

if (!TOKEN || !MONGODB_URI || !ADMIN_ID) {
  console.error('Iltimos .env faylga BOT_TOKEN, MONGODB_URI va ADMIN_ID qo\'ying.');
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });

// --- Mongoose models (inline for simplicity) ---
mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(()=>console.log('MongoDBga ulandi'))
  .catch(err => { console.error('MongoDB error:', err); process.exit(1); });

const { Schema } = mongoose;

const ProductSchema = new Schema({
  title: { type: Map, of: String }, // {uz: '', ru: '', en: ''}
  description: { type: Map, of: String },
  price: Number,
  category: String, // e.g., 'cakes','pastries','desserts'
  image: String,
  specialOptions: [String], // e.g., ["Name on cake"]
  available: { type: Boolean, default: true }
});
const Product = mongoose.model('Product', ProductSchema);

const CartSchema = new Schema({
  userId: Number,
  items: [{ productId: Schema.Types.ObjectId, qty: Number, options: Object }],
  lang: { type: String, default: LANG_DEFAULT }
});
const Cart = mongoose.model('Cart', CartSchema);

const OrderSchema = new Schema({
  userId: Number,
  name: String,
  phone: String,
  address: String,
  items: [{ productId: Schema.Types.ObjectId, title: Object, price: Number, qty: Number, options: Object }],
  total: Number,
  paymentMethod: String, // 'cash' or 'card'
  status: { type: String, default: 'new' }, // new, accepted, shipped, canceled
  lang: { type: String, default: LANG_DEFAULT },
  createdAt: { type: Date, default: Date.now }
});
const Order = mongoose.model('Order', OrderSchema);

// --- Simple i18n dictionary ---
const i18n = {
  uz: {
    welcome: 'Assalomu alaykum! Sweet shop botga xush kelibsiz 🍰\nTilni tanlang / Tilni o\'zgartirish: /lang',
    choose_cat: 'Kategoriya tanlang:',
    view_cart: 'Savatchani ko\'rsatish 🛒',
    checkout: 'Buyurtma berish ✅',
    empty_cart: 'Savatcha bo\'sh.',
    added_cart: 'Mahsulot savatchaga qo\'shildi.',
    enter_address: 'Manzilingizni kiriting (yetkazib berish uchun):',
    choose_payment: 'To\'lov usulini tanlang:',
    order_received: 'Buyurtmangiz qabul qilindi! Tez orada admin bilan bog\'lanamiz.',
    admin_notify: 'Yangi buyurtma:'
  },
  ru: {
    welcome: 'Здравствуйте! Добро пожаловать в Sweet shop bot 🍰\nВыберите язык: /lang',
    choose_cat: 'Выберите категорию:',
    view_cart: 'Показать корзину 🛒',
    checkout: 'Оформить заказ ✅',
    empty_cart: 'Корзина пуста.',
    added_cart: 'Товар добавлен в корзину.',
    enter_address: 'Введите адрес (для доставки):',
    choose_payment: 'Выберите способ оплаты:',
    order_received: 'Ваш заказ принят! Мы свяжемся с вами.',
    admin_notify: 'Новый заказ:'
  },
  en: {
    welcome: 'Hi! Welcome to Sweet shop bot 🍰\nChoose language: /lang',
    choose_cat: 'Choose a category:',
    view_cart: 'View cart 🛒',
    checkout: 'Checkout ✅',
    empty_cart: 'Cart is empty.',
    added_cart: 'Product added to cart.',
    enter_address: 'Please enter your address (for delivery):',
    choose_payment: 'Choose payment method:',
    order_received: 'Your order is received! We will contact you soon.',
    admin_notify: 'New order:'
  }
};

// --- Helper: get text by lang ---
function t(lang, key) {
  return (i18n[lang] && i18n[lang][key]) || i18n[LANG_DEFAULT][key] || key;
}

// --- Seed sample products (first-run) ---
async function seedProducts() {
  const count = await Product.countDocuments();
  if (count === 0) {
    const sample = [
      {
        title: { uz: 'Shokoladli tort', ru: 'Шоколадный торт', en: 'Chocolate Cake' },
        description: { uz: 'Boy shokoladli tort', ru: 'Насыщенный шоколадный торт', en: 'Rich chocolate cake' },
        price: 45,
        category: 'cakes',
        image: 'https://i.imgur.com/Khb6XgY.jpg',
        specialOptions: ['Ism yozish']
      },
      {
        title: { uz: 'Pishiriq (tortlets)', ru: 'Печенье (пирожное)', en: 'Pastry (tartlet)' },
        description: { uz: 'Yengil pishiriq', ru: 'Легкая выпечка', en: 'Light pastry' },
        price: 3,
        category: 'pastries',
        image: 'https://i.imgur.com/1bX5QH6.jpg',
      },
      {
        title: { uz: 'Karamel desert', ru: 'Десерт карамель', en: 'Caramel dessert' },
        description: { uz: 'Mazali karamel', ru: 'Вкусная карамель', en: 'Tasty caramel' },
        price: 5,
        category: 'desserts',
        image: 'https://i.imgur.com/3GvwNBf.jpg',
      }
    ];
    await Product.insertMany(sample);
    console.log('Sample products added.');
  }
}
seedProducts().catch(console.error);

// --- Keyboard helpers ---
const mainMenuKeyboard = (lang) => ({
  reply_markup: {
    inline_keyboard: [
      [{ text: lang === 'uz' ? 'Tortlar 🎂' : (lang === 'ru' ? 'Торты 🎂' : 'Cakes 🎂'), callback_data: 'cat_cakes' }],
      [{ text: lang === 'uz' ? 'Pishiriqlar 🧁' : (lang === 'ru' ? 'Выпечка 🧁' : 'Pastries 🧁'), callback_data: 'cat_pastries' }],
      [{ text: lang === 'uz' ? 'Desertlar 🍮' : (lang === 'ru' ? 'Десерты 🍮' : 'Desserts 🍮'), callback_data: 'cat_desserts' }],
      [{ text: t(lang,'view_cart'), callback_data: 'view_cart' }],
      [{ text: lang === 'uz' ? 'Til / Tilni o\'zgartirish' : (lang === 'ru' ? 'Язык / Изменить' : 'Language / Change'), callback_data: 'choose_lang' }]
    ]
  }
});

// --- User language store (simple in-memory cache, falls back to DB cart lang) ---
const userLang = {}; // { userId: 'uz' }

// --- Bot commands ---
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  userLang[chatId] = userLang[chatId] || LANG_DEFAULT;
  const lang = userLang[chatId];

  await bot.sendMessage(chatId, t(lang, 'welcome'));
  await bot.sendMessage(chatId, t(lang, 'choose_cat'), mainMenuKeyboard(lang));
});

// /lang command to open language selection
bot.onText(/\/lang/, (msg) => {
  const chatId = msg.chat.id;
  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🇺🇿 O‘zbekcha', callback_data: 'lang_uz' }],
        [{ text: '🇷🇺 Русский', callback_data: 'lang_ru' }],
        [{ text: '🇺🇸 English', callback_data: 'lang_en' }]
      ]
    }
  };
  bot.sendMessage(chatId, 'Tilni tanlang / Выберите язык / Choose language:', keyboard);
});

// callback handler
bot.on('callback_query', async (q) => {
  const chatId = q.message.chat.id;
  const data = q.data;
  userLang[chatId] = userLang[chatId] || LANG_DEFAULT;
  let lang = userLang[chatId];

  // language change
  if (data.startsWith('lang_')) {
    const newLang = data.split('_')[1];
    userLang[chatId] = newLang;
    lang = newLang;
    await bot.answerCallbackQuery(q.id, { text: 'OK' });
    await bot.sendMessage(chatId, t(lang,'welcome'), mainMenuKeyboard(lang));
    return;
  }

  if (data === 'choose_lang') {
    await bot.answerCallbackQuery(q.id);
    bot.emit('callback_query', { ...q, data: `lang_${lang}` }); // trigger language menu
    // Instead of re-emit we can show language menu normally:
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🇺🇿 O‘zbekcha', callback_data: 'lang_uz' }],
          [{ text: '🇷🇺 Русский', callback_data: 'lang_ru' }],
          [{ text: '🇺🇸 English', callback_data: 'lang_en' }]
        ]
      }
    };
    await bot.sendMessage(chatId, 'Tilni tanlang / Выберите язык / Choose language:', keyboard);
    return;
  }

  // view cart
  if (data === 'view_cart') {
    await showCart(chatId);
    await bot.answerCallbackQuery(q.id);
    return;
  }

  // categories
  if (data.startsWith('cat_')) {
    const category = data.split('_')[1]; // cakes, pastries, desserts
    const products = await Product.find({ category: category, available: true }).lean();
    if (!products.length) {
      await bot.sendMessage(chatId, 'Mahsulot topilmadi.');
      await bot.answerCallbackQuery(q.id);
      return;
    }
    for (const p of products) {
      const title = p.title?.get ? p.title.get(lang) : (p.title[lang] || p.title[LANG_DEFAULT]);
      const desc = p.description?.get ? p.description.get(lang) : (p.description && p.description[lang]);
      const caption = `*${title}*\n${desc || ''}\nNarx: ${p.price}$`;
      const keyboard = {
        reply_markup: {
          inline_keyboard: [
            [{ text: lang === 'uz' ? 'Savatchaga qo\'shish' : (lang === 'ru' ? 'Добавить в корзину' : 'Add to cart'), callback_data: `add_${p._id}` }],
            [{ text: lang === 'uz' ? 'Orqaga' : (lang === 'ru' ? 'Назад' : 'Back'), callback_data: 'back_main' }]
          ]
        },
        parse_mode: 'Markdown'
      };
      if (p.image) {
        await bot.sendPhoto(chatId, p.image, { caption, ...keyboard, parse_mode: 'Markdown' });
      } else {
        await bot.sendMessage(chatId, caption, keyboard);
      }
    }
    await bot.answerCallbackQuery(q.id);
    return;
  }

  // back to main
  if (data === 'back_main') {
    await bot.sendMessage(chatId, t(lang, 'choose_cat'), mainMenuKeyboard(lang));
    await bot.answerCallbackQuery(q.id);
    return;
  }

  // add to cart
  if (data.startsWith('add_')) {
    const prodId = data.split('_')[1];
    const product = await Product.findById(prodId).lean();
    if (!product) {
      await bot.answerCallbackQuery(q.id, { text: 'Mahsulot topilmadi.' });
      return;
    }
    // load or create cart
    let cart = await Cart.findOne({ userId: chatId });
    if (!cart) {
      cart = new Cart({ userId: chatId, items: [], lang });
    }
    // default qty = 1
    const existing = cart.items.find(it => String(it.productId) === String(prodId));
    if (existing) existing.qty += 1;
    else cart.items.push({ productId: prodId, qty: 1, options: {} });
    cart.lang = lang;
    await cart.save();
    await bot.answerCallbackQuery(q.id, { text: t(lang, 'added_cart') });
    return;
  }

  // checkout flow start
  if (data === 'checkout') {
    // ensure cart exists and not empty
    const cart = await Cart.findOne({ userId: chatId }).populate('items.productId');
    if (!cart || cart.items.length === 0) {
      await bot.answerCallbackQuery(q.id, { text: t(lang,'empty_cart') });
      return;
    }
    // ask for name (we'll ask sequentially)
    await bot.sendMessage(chatId, 'Ismingizni kiriting / Введите имя / Enter your name:');
    // Mark the user stage in-memory (simple flow)
    pendingUsers[chatId] = { stage: 'awaiting_name' , lang};
    await bot.answerCallbackQuery(q.id);
    return;
  }

  // other admin actions e.g., order accept via callback like admin_accept_ORDERID
  if (data.startsWith('admin_accept_') || data.startsWith('admin_mark_')) {
    if (chatId !== ADMIN_ID) {
      await bot.answerCallbackQuery(q.id, { text: 'Only admin.' });
      return;
    }
    const [action, , orderId] = data.split('_'); // e.g., admin_accept_<id>
    const order = await Order.findById(orderId);
    if (!order) {
      await bot.answerCallbackQuery(q.id, { text: 'Order not found.' });
      return;
    }
    if (action === 'admin') {
      // second token is accept or mark e.g., admin_accept or admin_mark
      // We split differently above; simpler parse:
    }
    // simpler approach: check full startsWith:
    if (data.startsWith('admin_accept_')) {
      order.status = 'accepted';
      await order.save();
      await bot.sendMessage(order.userId, `Sizning buyurtmangiz qabul qilindi. Status: accepted.`);
      await bot.answerCallbackQuery(q.id, { text: 'Order accepted.' });
      return;
    }
    if (data.startsWith('admin_mark_shipped_')) {
      order.status = 'shipped';
      await order.save();
      await bot.sendMessage(order.userId, `Sizning buyurtmangiz jo‘natildi. Status: shipped.`);
      await bot.answerCallbackQuery(q.id, { text: 'Marked shipped.' });
      return;
    }
  }

  await bot.answerCallbackQuery(q.id);
});

// --- Manage incoming text messages (for checkout flow) ---
const pendingUsers = {}; // { userId: { stage: 'awaiting_name'|'awaiting_phone'|'awaiting_address'|'awaiting_payment', orderDraft: {...} } }

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text || '';
  const lang = userLang[chatId] || LANG_DEFAULT;

  // ignore non-user flows like callback message auto messages
  if (msg.contact && pendingUsers[chatId] && pendingUsers[chatId].stage === 'awaiting_phone') {
    // got phone via contact
    pendingUsers[chatId].phone = msg.contact.phone_number;
    // ask address
    pendingUsers[chatId].stage = 'awaiting_address';
    await bot.sendMessage(chatId, t(lang,'enter_address'));
    return;
  }

  const state = pendingUsers[chatId];
  if (!state) return; // nothing pending

  if (state.stage === 'awaiting_name') {
    pendingUsers[chatId].name = text;
    pendingUsers[chatId].stage = 'awaiting_phone';
    // ask for phone with keyboard request contact
    const keyboard = {
      reply_markup: {
        keyboard: [[{ text: lang === 'uz' ? 'Kontaktni yuborish' : (lang === 'ru' ? 'Отправить контакт' : 'Send contact'), request_contact: true }]],
        one_time_keyboard: true,
        resize_keyboard: true
      }
    };
    await bot.sendMessage(chatId, lang === 'uz' ? 'Telefon raqamingizni yuboring:' : (lang === 'ru' ? 'Отправьте номер телефона:' : 'Please send your phone number:'), keyboard);
    return;
  }

  if (state.stage === 'awaiting_address') {
    pendingUsers[chatId].address = text;
    pendingUsers[chatId].stage = 'awaiting_payment';
    // ask payment method
    const payKeyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: lang === 'uz' ? 'Naqd pul' : (lang === 'ru' ? 'Наличные' : 'Cash'), callback_data: 'pay_cash' }],
          [{ text: lang === 'uz' ? 'Karta (operator orqali)' : (lang === 'ru' ? 'Карта' : 'Card (via operator)'), callback_data: 'pay_card' }]
        ]
      }
    };
    await bot.sendMessage(chatId, t(lang,'choose_payment'), payKeyboard);
    return;
  }

  // If user types something else while pending, ignore or help
});

// --- Payment callback (finalize order) ---
bot.on('callback_query', async (q) => {
  const chatId = q.message.chat.id;
  const data = q.data;
  const lang = userLang[chatId] || LANG_DEFAULT;

  if (data === 'pay_cash' || data === 'pay_card') {
    const method = data === 'pay_cash' ? 'cash' : 'card';
    const state = pendingUsers[chatId];
    if (!state || !state.name || !state.address) {
      await bot.answerCallbackQuery(q.id, { text: 'Checkout flow not started.' });
      return;
    }

    // load cart
    const cart = await Cart.findOne({ userId: chatId });
    if (!cart || cart.items.length === 0) {
      await bot.answerCallbackQuery(q.id, { text: t(lang,'empty_cart') });
      return;
    }

    // build order items with product snapshot
    const populatedItems = [];
    let total = 0;
    for (const it of cart.items) {
      const prod = await Product.findById(it.productId).lean();
      if (!prod) continue;
      const title = prod.title?.get ? prod.title.get(lang) : (prod.title && prod.title[lang]) || prod.title[LANG_DEFAULT];
      const price = prod.price;
      populatedItems.push({ productId: prod._id, title, price, qty: it.qty, options: it.options || {} });
      total += price * it.qty;
    }

    const order = new Order({
      userId: chatId,
      name: state.name,
      phone: state.phone || '',
      address: state.address,
      items: populatedItems,
      total,
      paymentMethod: method,
      lang
    });
    await order.save();

    // clear cart
    await Cart.deleteOne({ userId: chatId });
    delete pendingUsers[chatId];

    // notify user
    await bot.sendMessage(chatId, t(lang,'order_received'));

    // notify admin with order details and action buttons
    let itemsText = populatedItems.map(i => `${i.title} x${i.qty} - ${i.price}$`).join('\n');
    const adminMsg = `${t(lang,'admin_notify')}\nOrder ID: ${order._id}\nName: ${order.name}\nPhone: ${order.phone}\nAddress: ${order.address}\nPayment: ${order.paymentMethod}\nTotal: ${order.total}$\n\nItems:\n${itemsText}`;
    const adminKeyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Accept', callback_data: `admin_accept_${order._id}` }, { text: 'Mark shipped', callback_data: `admin_mark_shipped_${order._id}` }]
        ]
      }
    };
    await bot.sendMessage(ADMIN_ID, adminMsg, adminKeyboard);

    await bot.answerCallbackQuery(q.id, { text: 'OK' });
    return;
  }
});

// --- showCart function ---
async function showCart(chatId) {
  const lang = userLang[chatId] || LANG_DEFAULT;
  const cart = await Cart.findOne({ userId: chatId });
  if (!cart || cart.items.length === 0) {
    await bot.sendMessage(chatId, t(lang,'empty_cart'));
    return;
  }
  let text = 'Sizning savatcha:\n';
  let total = 0;
  for (const it of cart.items) {
    const prod = await Product.findById(it.productId).lean();
    if (!prod) continue;
    const title = prod.title?.get ? prod.title.get(lang) : (prod.title && prod.title[lang]) || prod.title[LANG_DEFAULT];
    const line = `${title} x${it.qty} — ${prod.price}$\n`;
    total += prod.price * it.qty;
    text += line;
  }
  text += `\nJami: ${total}$`;
  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: t(lang,'checkout'), callback_data: 'checkout' }],
        [{ text: lang === 'uz' ? 'Bosh menyu' : (lang === 'ru' ? 'Главное меню' : 'Main menu'), callback_data: 'back_main' }]
      ]
    }
  };
  await bot.sendMessage(chatId, text, keyboard);
}

// --- Admin command to list orders ---
bot.onText(/\/orders/, async (msg) => {
  if (msg.chat.id !== ADMIN_ID) return;
  const orders = await Order.find().sort({ createdAt: -1 }).limit(20).lean();
  if (!orders.length) return bot.sendMessage(ADMIN_ID, 'Orders not found.');
  for (const o of orders) {
    let itemsText = o.items.map(i => `${i.title} x${i.qty} - ${i.price}$`).join('\n');
    const summary = `Order ID: ${o._id}\nUser: ${o.userId}\nName: ${o.name}\nPhone: ${o.phone}\nAddress: ${o.address}\nStatus: ${o.status}\nTotal: ${o.total}$\nItems:\n${itemsText}`;
    const adminKeyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Accept', callback_data: `admin_accept_${o._id}` }, { text: 'Mark shipped', callback_data: `admin_mark_shipped_${o._id}` }]
        ]
      }
    };
    await bot.sendMessage(ADMIN_ID, summary, adminKeyboard);
  }
});

// --- Small command to add product (admin) e.g., /addprod JSON ---
// For simplicity, admin can insert product via /addprod {"title":{"uz":"...","ru":"...","en":"..."},"price":...,"category":"cakes","image":"..."}
bot.onText(/\/addprod (.+)/, async (msg, match) => {
  if (msg.chat.id !== ADMIN_ID) return;
  try {
    const payload = JSON.parse(match[1]);
    const product = new Product(payload);
    await product.save();
    await bot.sendMessage(ADMIN_ID, 'Product saved: ' + product._id);
  } catch (err) {
    await bot.sendMessage(ADMIN_ID, 'Error parsing JSON: ' + err.message);
  }
});

// --- /menu to show main menu in selected language ---
bot.onText(/\/menu/, (msg) => {
  const chatId = msg.chat.id;
  const lang = userLang[chatId] || LANG_DEFAULT;
  bot.sendMessage(chatId, t(lang,'choose_cat'), mainMenuKeyboard(lang));
});

console.log('Bot ishga tushdi...');
