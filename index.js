require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");

// Load environment variables
const {
  TELEGRAM_BOT_TOKEN,
  AIRTABLE_API_KEY,
  AIRTABLE_BASE_ID,
  AIRTABLE_TABLE_NAME,
} = process.env;

// Initialize Telegram bot
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

// Airtable API URL
const AIRTABLE_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_NAME}?typecast=true`;

// Store user sessions
const userSessions = {};

// Array of new category values
const newCategories = [
  "Primary venue/coworking space rental",
  "Primary venue construction & fit out",
  "Event staff (security, organizational support, local assistance)",
  "Required permits and insurance",
  "Weekly Community Dinners",
  "Venue reservations for live music night / EOW happy hour",
  "Local musicians for live music night / EOW happy hour",
  "Planned excursions & experiences",
  "Transportation & shuttles (for excursions)",
  "Forma summit production + catering",
  "Daily breakfast catering (during weekdays)",
  'Pizza for "Forma to Public" sessions',
  "Deposits for accommodation partners",
  "Branded Signage",
  "Digital Brand, collateral + website",
  "Photo & Videography",
  "Post-production",
  "Promo (SEO, PR & other distro)",
  "Event Designer",
  "Event Production Vendor(s)",
  "Web / Graphic Designer",
  "Contract Developers (for Forma Community Tooling)",
  "Co-founder",
  "Community & Growth Lead",
  "Events & Operations Lead",
  "Storytelling & Content Lead",
  "Flight - Scouting Trip",
  "Flight - Pop Up Trip",
  "Accommodation - scouting trip",
  "Accommodation - Pop Up Trip",
  "Daily travel & misc - Scouting Trip",
  "Daily travel & misc - Pop Up Trip",
  "Hosted meetings (meals / drinks) - Scouting Trip",
  "Hosted meetings (meals / drinks) - Pop Up Trip",
  "Entity + operating license + misc legal (UAE)",
  "Visas + labor permit (UAE)",
  "Insurance (UAE)",
  "Software Subscriptions",
];

// Handle text messages
bot.on("message", async (msg) => {
    const chatId = "-1002127173770,";
    const messageText = msg.text || "";
    const session = userSessions[chatId] || {};
    const username = msg.from.username ? `@${msg.from.username}` : "No username";
  
    console.log(msg);
  
    // Check if the message is from a supergroup
    if (msg.chat.type === "supergroup") {
      // Check if the message is a reply to another message
      if (msg.reply_to_message && msg.reply_to_message.forum_topic_created) {
        const topicName = msg.reply_to_message.forum_topic_created.name;
  
        // Check if the topic is "claim"
        if (topicName === "claim") {
          if (messageText.startsWith("/claim")) {
            const itemName = messageText.split(" ")[1];
            if (itemName) {
              userSessions[chatId] = { itemName, step: 1, username };
              await bot.sendMessage(
                chatId,
                "Please send a picture of the receipt. Make sure to directly reply to this message.",
                { message_thread_id: 12461 }
              );
            } else {
              await bot.sendMessage(
                chatId,
                "Please provide an item name after /claim. Example: /claim ItemName",
                { message_thread_id: 12461 }
              );
            }
          }
        }
      }
  
      // Handle receipt photo upload
      if (session.step === 1 && msg.photo) {
        const fileId = msg.photo[msg.photo.length - 1].file_id;
        try {
          const fileLink = await bot.getFileLink(fileId);
          session.receipt = fileLink;
          session.step = 2; // Update the session step here
          userSessions[chatId] = session; // Save the updated session back to userSessions
          await sendCategoryOptions(chatId);
        } catch (error) {
          console.error(`Failed to get file link: ${error.message}`);
          await bot.sendMessage(
            chatId,
            "There was an error processing the receipt. Please try again.",
            { message_thread_id: 12461 }
          );
        }
      } else if (session.step === 3) {
        if (!isNaN(messageText)) {
          session.sum = parseFloat(messageText);
          await submitClaim(chatId, session);
          delete userSessions[chatId];
        } else {
          await bot.sendMessage(
            chatId,
            "Please enter a valid number for the sum in USDC. Directly respond to this message.",
            { message_thread_id: 12461 }
          );
        }
      }
    }
  });
  

// Send category options to the user
const sendCategoryOptions = async (chatId) => {
  const options = {
    message_thread_id: 12461,
    reply_markup: {
      inline_keyboard: newCategories.map((category) => [
        { text: category, callback_data: category },
      ]),
    },
  };
  await bot.sendMessage(
    chatId,
    "Please select a category:",
    options
  );
};

// Handle category selection
bot.on("callback_query", async (callbackQuery) => {
  const chatId = "-1002127173770,"
  const category = callbackQuery.data;
  const session = userSessions[chatId];

  if (session && session.step === 2) {
    const selectedCategory = category.trim(); // Trim any whitespace
    if (newCategories.includes(selectedCategory)) {
      // Validate against allowed categories
      session.category = selectedCategory;
      session.step = 3; // Move to the next step
      await bot.sendMessage(
        chatId,
        "What is the sum in USDC? Please directly respond to this message.",
        { message_thread_id: 12461 }
      );
    } else {
      await bot.sendMessage(
        chatId,
        "Invalid category selected. Please try again.",
        { message_thread_id: 12461 }
      );
    }
  }

  await bot.answerCallbackQuery(callbackQuery.id);
});

// Submit claim to Airtable
const submitClaim = async (chatId, session) => {
  console.log("Category being sent:", session.category); // Log the category value
  const record = {
    fields: {
      Item: session.itemName,
      "Paid By": session.username,
      Sum: session.sum,
      "Paid status": "non-reimbursed", // Default status set to "Non-reimbursed"
      Receipt: [{ url: session.receipt }], // Correct format for the attachment
      category_string: session.category.trim(),
    },
  };

  try {
    console.log(
      "Submitting record to Airtable:",
      JSON.stringify(record, null, 2)
    );
    await axios.post(
      AIRTABLE_URL,
      { records: [record] },
      {
        headers: {
          Authorization: `Bearer ${AIRTABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );
    await bot.sendMessage(chatId, "Claim uploaded to Airtable successfully!", {
      message_thread_id: 12461,
    });
  } catch (error) {
    console.error(`Error uploading claim: ${error.message}`);
    if (error.response && error.response.data) {
      console.error(
        `Airtable response: ${JSON.stringify(error.response.data, null, 2)}`
      );
    }
    await bot.sendMessage(
      chatId,
      `Failed to upload claim to Airtable: ${error.message}`,
      { message_thread_id: 12461 }
    );
  }
};
