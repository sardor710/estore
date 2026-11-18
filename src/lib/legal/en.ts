import type { LegalContent } from './types'

const en: LegalContent = {
  labels: {
    updated: 'Last updated',
    sellerFallback: 'the online store zanko.uz',
    contactsTitle: 'Seller details and contacts',
    name: 'Seller',
    inn: 'INN (TIN)',
    address: 'Address',
    phone: 'Phone',
    email: 'Email',
    telegram: 'Telegram',
    hours: 'Working hours',
    notSet: 'Contact us through the Telegram bot {bot}.',
    footer: 'Information',
    short: { offer: 'Public offer', privacy: 'Privacy policy', warranty: 'Warranty and returns' },
  },

  offer: {
    title: 'Public offer agreement',
    description: 'Terms of sale of goods in the {site} online store: ordering, prices, delivery, payment, warranty and returns.',
    sections: [
      {
        h: '1. General provisions',
        blocks: [
          '1.1. This document is an official public offer by {seller} (the “Seller”) to conclude a contract of retail sale of goods at a distance with any legally capable individual (the “Buyer”) through the website {site} and the Telegram bot {bot} (together, the “Store”).',
          '1.2. Placing an order in the Store (on the website or in the Telegram bot) is full and unconditional acceptance of this offer. The contract is concluded when the Seller confirms the order by phone or message.',
          '1.3. The relations of the parties are governed by the Civil Code of the Republic of Uzbekistan, the Law “On the Protection of Consumer Rights”, the Law “On Electronic Commerce” and other legislation of the Republic of Uzbekistan. If any term of this offer contradicts mandatory consumer protection rules, the rules of the law apply.',
          '1.4. The Seller may change this offer. The version published in the Store at the moment the order is placed applies to that order.',
        ],
      },
      {
        h: '2. Goods and prices',
        blocks: [
          '2.1. Descriptions, photos and specifications of goods in the Store are provided for information. The colour of a product may differ slightly from the photo because of screen settings; the manufacturer may change the packaging or design without notice, provided the main characteristics stay the same.',
          '2.2. Prices are in Uzbek soʻm (UZS). The price that applies is the one shown in the Store when the order is placed. Promotional prices are valid for the period of the promotion and while stock lasts.',
          '2.3. If, after an order is placed, a product turns out to be out of stock or its price was shown with an obvious error, the Seller informs the Buyer, who may accept a replacement or cancel the order. In this case no payment is taken.',
        ],
      },
      {
        h: '3. Placing and confirming an order',
        blocks: [
          '3.1. The Buyer provides a name, phone number and delivery address and is responsible for their accuracy.',
          '3.2. After an order is placed, the Seller contacts the Buyer to confirm the items, the price and the delivery time.',
          '3.3. The Seller may cancel an order if the Buyer cannot be reached to confirm it or has provided incorrect data.',
          '3.4. The Buyer may cancel an order free of charge at any time before it is handed over: by phone, through the Telegram bot or in the account on the website.',
        ],
      },
      {
        h: '4. Delivery and acceptance',
        blocks: [
          '4.1. The Seller delivers goods across the Republic of Uzbekistan. Delivery is free unless the order states otherwise. The delivery time is agreed when the order is confirmed.',
          '4.2. On receipt, the Buyer (or the Buyer’s representative) checks in the presence of the courier the quantity, completeness and appearance of the goods and the integrity of the packaging. The Buyer may refuse goods with visible damage, an incomplete set or the wrong item; they are replaced free of charge.',
          '4.3. Ownership of the goods and the risk of accidental loss or damage pass to the Buyer when the goods are handed over and paid for.',
        ],
      },
      {
        h: '5. Payment',
        blocks: [
          '5.1. The Buyer pays for the goods on delivery, in cash or by another method offered by the Seller when the order is confirmed.',
          '5.2. The Seller issues a payment receipt as required by the legislation of the Republic of Uzbekistan.',
        ],
      },
      {
        h: '6. Warranty and returns',
        blocks: [
          '6.1. The warranty, the conditions of replacement and the return of goods are set out in the [Warranty and returns](/legal/warranty) section, which is an integral part of this offer.',
        ],
      },
      {
        h: '7. Liability',
        blocks: [
          '7.1. The Seller is not liable for damage caused by use of the goods contrary to the manufacturer’s instructions, or for delays caused by incorrect data provided by the Buyer.',
          '7.2. The parties are released from liability for failure to perform their obligations caused by force majeure (natural disasters, actions of state bodies, failures of communication networks and similar circumstances beyond the parties’ control).',
        ],
      },
      {
        h: '8. Personal data',
        blocks: ['8.1. By placing an order, the Buyer agrees to the processing of personal data in accordance with the [Privacy policy](/legal/privacy).'],
      },
      {
        h: '9. Claims and disputes',
        blocks: [
          '9.1. The Buyer may send a claim by phone, through the Telegram bot or in writing to the Seller’s address. The Seller considers claims within the time limits established by the legislation on the protection of consumer rights.',
          '9.2. Disputes are settled through negotiation. If no agreement is reached, a dispute is settled in court in accordance with the legislation of the Republic of Uzbekistan. The Buyer may also contact the authorities responsible for the protection of consumer rights.',
        ],
      },
      { h: '10. Seller details', blocks: [{ contacts: true }] },
    ],
  },

  privacy: {
    title: 'Privacy policy',
    description: 'What personal data the {site} online store collects, why, who it is shared with and how to manage it.',
    sections: [
      {
        h: '1. General provisions',
        blocks: [
          '1.1. This policy explains how {seller} (“we”) processes the personal data of users of the website {site} and the Telegram bot {bot}, in accordance with the Law of the Republic of Uzbekistan “On Personal Data”.',
          '1.2. By placing an order, signing in or otherwise using the Store, you agree to the processing of your personal data as described in this policy.',
        ],
      },
      {
        h: '2. What data we collect',
        blocks: [
          {
            ul: [
              'Order details: name, phone number, region, delivery address, comment to the order and, if you choose to share it, the location point for the courier.',
              'Telegram account data when you sign in through the bot: Telegram ID, first and last name, username, the phone number you share in Telegram, your language and notification settings.',
              'Your order history, saved addresses, favourites and the messages we send you in the Store.',
              'Technical data: a sign-in cookie that keeps you logged in; anonymous visit statistics collected without cookies (we use an identifier that changes every day and do not store IP addresses in statistics); server logs with IP address and browser type, kept for a short time for security.',
            ],
          },
          'Your shopping cart is stored in your own browser. We do not collect bank card details.',
        ],
      },
      {
        h: '3. Why we use it',
        blocks: [
          {
            ul: [
              'to accept, confirm and deliver orders and to contact you about them;',
              'to handle warranty claims, replacements and returns;',
              'to run your account and send order status notifications in Telegram;',
              'to send Store news and offers in Telegram; you can turn this off at any time with the /notifications command in the bot;',
              'to protect the Store from abuse and fraud;',
              'to meet obligations under tax, accounting and other legislation.',
            ],
          },
        ],
      },
      {
        h: '4. Who we share it with',
        blocks: [
          {
            ul: [
              'Couriers and delivery services: only the name, phone number and address needed to deliver your order.',
              'Telegram: messages from the bot are delivered through Telegram, which processes data under its own privacy policy.',
              'Our hosting provider, which stores the Store’s data on our behalf.',
              'State bodies, when this is required by law.',
            ],
          },
          'We do not sell personal data and do not use advertising trackers.',
        ],
      },
      {
        h: '5. How long we keep it',
        blocks: [
          '5.1. Account data is kept until you delete your account. Order data is kept for the period required by tax and accounting legislation and for the duration of the warranty. Server logs are kept for a few weeks.',
          '5.2. When the storage period ends or the purpose is achieved, the data is deleted or anonymised.',
        ],
      },
      {
        h: '6. Your rights',
        blocks: [
          {
            ul: [
              'to know what data about you we process and to receive a copy of it;',
              'to correct inaccurate data (most of it can be changed in your account);',
              'to withdraw your consent and delete your account: in your account on the website (Profile) or by contacting us;',
              'to turn off news and offers in the Telegram bot (/notifications);',
              'to complain to the authorised state body for personal data or to the court.',
            ],
          },
        ],
      },
      {
        h: '7. Security',
        blocks: [
          '7.1. The Store works only over an encrypted HTTPS connection. Access to personal data is limited to staff who need it to process orders; staff passwords are stored in encrypted (hashed) form; regular backups are made.',
        ],
      },
      {
        h: '8. Minors',
        blocks: ['8.1. The Store is intended for adults. Persons under 18 may place orders only with the consent of their parents or legal representatives.'],
      },
      {
        h: '9. Changes and contacts',
        blocks: [
          '9.1. We may update this policy; the current version is always published on this page with the date of the last update.',
          '9.2. For questions about personal data, contact us:',
          { contacts: true },
        ],
      },
    ],
  },

  warranty: {
    title: 'Warranty and returns',
    description: '1-year warranty on all products and 2 years on cables, replacement with a new product, and returns within 14 days.',
    sections: [
      {
        h: '1. Warranty period',
        blocks: [
          {
            ul: [
              '12 months: chargers, power banks, audio and all other products;',
              '24 months: cables.',
            ],
          },
          'The warranty period starts on the day you receive the product. Your order number (it is in your account and in the Telegram bot) or the payment receipt is your proof of purchase.',
        ],
      },
      {
        h: '2. What we do if a product is faulty',
        blocks: [
          'If a defect covered by the warranty appears during the warranty period, we replace the product with a new identical one. If that model is no longer available, we offer an equivalent model or refund its price, at your choice.',
          'The warranty period for the replacement product starts again from the day of replacement. We cover the delivery costs of a warranty replacement.',
          'This warranty does not limit the other rights you have under the legislation on the protection of consumer rights.',
        ],
      },
      {
        h: '3. What the warranty covers',
        blocks: [
          'A product is replaced if, during normal use according to the manufacturer’s instructions, any of the following happens:',
          'Chargers (wall, car, wireless, GaN):',
          {
            ul: [
              'does not turn on or does not charge a compatible device;',
              'one or more ports do not work;',
              'output power or fast charging (PD, QC, PPS) is clearly below the stated specification with a compatible cable and device;',
              'overheats, switches off or restarts during normal use;',
              'the display, indicator or folding plug does not work;',
              'buzzes loudly or smells of burning (stop using it and contact us).',
            ],
          },
          'Power banks:',
          {
            ul: [
              'does not charge itself or does not charge devices;',
              'does not hold a charge or discharges quickly when not in use;',
              'its capacity is far below what is normal for the model;',
              'the battery swells or leaks (stop using it immediately and contact us);',
              'ports, buttons, the indicator, display, wireless pad or built-in cables do not work.',
            ],
          },
          'Cables:',
          {
            ul: [
              'does not charge or does not transfer data;',
              'the connection drops or works only at a certain angle, with no visible damage;',
              'does not support the fast charging, data speed or video output stated in its specification;',
              'a connector becomes loose, or the wires break inside the connector, during normal use.',
            ],
          },
          'Other accessories (earbuds, headphones, speakers, hubs and adapters, holders and stands, watch and phone accessories):',
          {
            ul: [
              'does not turn on, charge or connect via Bluetooth;',
              'no sound or distorted sound in one or both channels, or the microphone does not work;',
              'the battery lasts much less than stated by the manufacturer;',
              'buttons, touch controls, ports or indicators do not work;',
              'a hub or adapter port or function does not work;',
              'the mechanism, hinge or magnets of a holder or stand break during normal use.',
            ],
          },
        ],
      },
      {
        h: '4. What the warranty does not cover',
        blocks: [
          {
            ul: [
              'mechanical damage: cracks, dents, bent or broken connectors, a cut, chewed, crushed or kinked cable, bites of pets;',
              'liquid, moisture or corrosion damage;',
              'damage from fire, extreme heat or cold;',
              'use with a faulty or non-standard power source, voltage surges, or use not according to the manufacturer’s instructions;',
              'products opened, repaired or modified by anyone other than us, or with damaged or removed serial labels;',
              'normal wear and cosmetic changes: scratches, faded colour, worn ear tips; the natural, gradual loss of battery capacity over time;',
              'small included parts and consumables: ear tips, pouches, packaging;',
              'incompatibility with a device that is not listed as supported, or problems caused by the software of your own device;',
              'loss or theft, and products not bought from our Store.',
            ],
          },
        ],
      },
      {
        h: '5. How to make a warranty claim',
        blocks: [
          {
            ul: [
              'Contact us through the Telegram bot or by phone, give your order number and describe the problem.',
              'Hand over or send us the product with all its accessories (preferably in the original box).',
              'We check the product, usually within 1–3 working days; if a longer technical check is needed, within the time limits set by law.',
              'If the defect is covered by the warranty, we give you a new product.',
            ],
          },
        ],
      },
      {
        h: '6. Returns within 14 days',
        blocks: [
          'You can return a product of proper quality within 14 days from the day you received it if:',
          {
            ul: [
              'the box is unopened: the factory seal or sticker is intact;',
              'the product is unused and still in saleable condition, with the full set, labels and original packaging;',
              'you have the order number or the receipt.',
            ],
          },
          'We refund the full price of the product within 10 days after we receive and check it, in cash or by transfer to your bank card. Returning a product of proper quality is at your own cost; we can arrange pick-up with our courier. Instead of a refund, you can exchange the product for another one.',
          'A product whose seal is broken cannot be returned simply because you changed your mind. If it is faulty, it is replaced under the warranty.',
        ],
      },
      {
        h: '7. Problems at delivery',
        blocks: [
          'Check the order when the courier hands it over. If the wrong product was delivered, something is missing, or the product or its packaging is damaged, you can refuse it on the spot without paying, or tell us within 24 hours, and we will replace it free of charge.',
        ],
      },
      { h: '8. Contacts', blocks: [{ contacts: true }] },
    ],
  },
}

export default en
