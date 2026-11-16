// Ported from legacy/src/data/products.js (Vite demo). Used only by prisma/seed-demo.ts.
export type DemoProduct = {
  id: string
  handle: string
  name: string
  subName: string
  legacyCategory: string
  price: number
  compareAtPrice: number | null
  badge: string | null
  tagline: string
  description: string
  features: string[]
  specs: Record<string, string>
  colors: { id: string; name: string; hex: string; imageIndex: number }[]
  images: string[]
}

export const DEMO_PRODUCTS: DemoProduct[] = [
  {
    "id": "modern-leather-case",
    "handle": "modern-leather-case-black-horween-iphone-18-pro-max",
    "name": "Modern Leather Case",
    "subName": "Horween® Leather • iPhone 18 Pro Max",
    "legacyCategory": "Cases",
    "price": 79,
    "compareAtPrice": 90,
    "badge": "HORWEEN® LEATHER",
    "tagline": "Rugged Luxury & Tactile Camera Control for iPhone 18 Pro Max",
    "description": "Crafted for iPhone 18 Pro Max in our celebrated Modern Case series, combining vegetable-tanned American Horween leather with anodized aluminum buttons and a dedicated Camera Control interface. Designed to absorb 8-foot drops while aging into a lustrous, one-of-a-kind personal patina.",
    "features": [
      "Authentic American vegetable-tanned Horween® leather from Chicago",
      "Integrated Camera Control button with tactile capacitive sensor interface",
      "Anodized aluminum power and volume buttons with refined feedback",
      "8-foot drop protection powered by high-density TPE perimeter bumper",
      "Full MagSafe and Qi2 wireless charging compatibility with NdFeB magnet ring",
      "Plush micro-suede internal lining guards against abrasions"
    ],
    "specs": {
      "Materials": "Full-grain Horween leather, polycarbonate body, TPE bumper, anodized aluminum buttons, microfiber interior",
      "Drop Protection": "8 feet (2.4 meters) drop certified",
      "Camera Control": "Conductive glass / sapphire interface matching Apple tactile feel",
      "MagSafe": "Nickel-plated neodymium magnets, 800-1100gf magnetic pull force",
      "Screen Clearance": "1.15mm raised protective lip around OLED screen",
      "Camera Clearance": "2.3mm raised protective bezel around camera array",
      "Compatibility": "iPhone 18 Pro Max, MagSafe chargers, Qi wireless docks"
    },
    "colors": [
      {
        "id": "black",
        "name": "Horween Black",
        "hex": "#19191A",
        "imageIndex": 0
      },
      {
        "id": "rustic-brown",
        "name": "Rustic Brown",
        "hex": "#6F4528",
        "imageIndex": 1
      },
      {
        "id": "natural",
        "name": "Natural Horween",
        "hex": "#B88A58",
        "imageIndex": 2
      }
    ],
    "images": [
      "https://cdn.shopify.com/s/files/1/0384/6721/files/855848009186_A_PHONE.jpg?v=1787461446&width=1200",
      "https://cdn.shopify.com/s/files/1/0384/6721/files/855848009186_B_LOGO_PHONE.jpg?v=1787452267&width=1200",
      "https://cdn.shopify.com/s/files/1/0384/6721/files/855848009186_C_LOGO_PHONE.jpg?v=1787452267&width=1200",
      "https://cdn.shopify.com/s/files/1/0384/6721/files/855848009186_D_PHONE.jpg?v=1787452267&width=1200",
      "https://cdn.shopify.com/s/files/1/0384/6721/files/855848009186_E.jpg?v=1787452267&width=1200",
      "https://cdn.shopify.com/s/files/1/0384/6721/files/855848009186_F_PHONE.jpg?v=1787452267&width=1200"
    ]
  },
  {
    "id": "stand-one-max",
    "handle": "stand-one-max-4th-gen-silver",
    "name": "Stand One Max",
    "subName": "4th Generation",
    "legacyCategory": "Charging",
    "price": 159,
    "compareAtPrice": 180,
    "badge": "BESTSELLER",
    "tagline": "Fast Wireless Charging Reimagined for iPhone, Apple Watch, and AirPods",
    "description": "Designed with official MagSafe technology and fast Apple Watch charging, Stand One Max delivers peak 15W wireless charging in an ultra-premium, weighted metal and glass chassis. Its upright design keeps your iPhone visible in StandBy mode while simultaneously charging your Apple Watch and AirPods.",
    "features": [
      "Official 15W MagSafe Fast Wireless Charging for iPhone",
      "Fast charging Apple Watch puck compatible with all Apple Watch generations",
      "Dedicated 5W wireless AirPods charging dish",
      "Weighted solid aluminum and glass construction (nearly 2 lbs) that stays put",
      "Supports Apple StandBy mode for desk or bedside clock views",
      "Includes premium 2.0m braided nylon USB-C power cable"
    ],
    "specs": {
      "Materials": "CNC-machined anodized aluminum, glass top surface, anti-slip silicone base",
      "Charging Speeds": "Up to 15W MagSafe (iPhone 12 through 16), 5W Fast Charging (Apple Watch Ultra & Series 7+), 5W Qi (AirPods)",
      "Dimensions": "142mm x 82mm x 127mm",
      "Weight": "890g (1.96 lbs)",
      "Compatibility": "iPhone 16 / 15 / 14 / 13 / 12 series, Apple Watch Ultra 2/1, Series 10/9/8/7/SE, AirPods with MagSafe / Wireless case",
      "Power Requirements": "Requires minimum 30W USB-C PD power adapter (sold separately)"
    },
    "colors": [
      {
        "id": "silver",
        "name": "Silver",
        "hex": "#D8D9DB",
        "imageIndex": 0
      },
      {
        "id": "carbide",
        "name": "Carbide Black",
        "hex": "#222224",
        "imageIndex": 1
      }
    ],
    "images": [
      "https://cdn.shopify.com/s/files/1/0384/6721/files/856504015619_A_0c8fb290-eac5-4e74-abf2-2ae94f67bba5.jpg?v=1762973205&width=1200",
      "https://cdn.shopify.com/s/files/1/0384/6721/files/856504015619_C_6404e66a-b64c-4a82-b41a-85a00e9c9446.jpg?v=1762462660&width=1200",
      "https://cdn.shopify.com/s/files/1/0384/6721/files/856504015619_F_cdad4c9d-9118-4830-a645-7e0d4c7ad20b.jpg?v=1762278088&width=1200",
      "https://cdn.shopify.com/s/files/1/0384/6721/files/856504015619_G_b7e9fe54-fa9a-4c28-98e9-e3adcb63b1a8.jpg?v=1762278088&width=1200",
      "https://cdn.shopify.com/s/files/1/0384/6721/files/856504015619_H_11c05d76-bc30-4e36-9b16-43b664d9aa84.jpg?v=1762278088&width=1200"
    ]
  },
  {
    "id": "traditional-leather-case",
    "handle": "traditional-leather-case-black-horween-iphone-18-pro-max",
    "name": "Traditional Leather Case",
    "subName": "Horween® Leather • iPhone 16 Pro Max",
    "legacyCategory": "Cases",
    "price": 89,
    "compareAtPrice": null,
    "badge": "HORWEEN® LEATHER",
    "tagline": "Full-Grain Vegetable Tanned American Leather that Patinas With Age",
    "description": "Crafted with renowned Horween leather sourced directly from Chicago, Traditional Leather Case elevates the look and feel of your iPhone while offering rugged 8-foot drop protection. With time and daily handling, this leather develops a rich, lustrous patina unique to your journey.",
    "features": [
      "Authentic American vegetable-tanned Horween® leather",
      "Develops a rugged, rich patina over months of use",
      "Anodized aluminum tactile push buttons",
      "Integrated MagSafe magnet array with high-strength neodymium magnets",
      "Protective TPE perimeter bumper absorbs shocks up to 8 feet",
      "Internal soft microfiber lining prevents scratches"
    ],
    "specs": {
      "Materials": "Full grain Horween leather, polycarbonate chassis, TPE bumper, microfiber interior, aluminum buttons",
      "Drop Protection": "8 feet (2.4 meters)",
      "MagSafe": "Nickel-plated NdFeB magnets, 800-1100gf magnetic force",
      "Screen Clearance": "1.1mm raised protective edge around display",
      "Camera Clearance": "2.2mm raised protective frame around camera lenses",
      "Wireless Charging": "Fully compatible with Qi and MagSafe wireless chargers"
    },
    "colors": [
      {
        "id": "rustic-brown",
        "name": "Rustic Brown",
        "hex": "#6F4528",
        "imageIndex": 0
      },
      {
        "id": "black",
        "name": "Black",
        "hex": "#1E1E1E",
        "imageIndex": 1
      },
      {
        "id": "olde-dublin",
        "name": "Olde Dublin Tan",
        "hex": "#A05A2C",
        "imageIndex": 2
      }
    ],
    "images": [
      "https://cdn.shopify.com/s/files/1/0384/6721/files/856504017859_D_PHONE_8ec4724d-20ea-4f95-93f4-71b3e64a71af.jpg?v=1734991185&width=1200",
      "https://cdn.shopify.com/s/files/1/0384/6721/files/856504017859_E_51a7cf88-1f44-45fd-812c-c17c34c5d11c.jpg?v=1734991185&width=1200",
      "https://cdn.shopify.com/s/files/1/0384/6721/files/856504017859_F_PHONE_887e5b15-9c98-4dfb-90f7-6fc9be71e959.jpg?v=1734991185&width=1200",
      "https://cdn.shopify.com/s/files/1/0384/6721/files/856504017859_G_8992e5c8-10a4-44a3-b40b-7038e8ec6f42.jpg?v=1734991185&width=1200",
      "https://cdn.shopify.com/s/files/1/0384/6721/files/856504017859_B_4a96da1e-0558-450f-a320-cffda703808b.jpg?v=1734991185&width=1200"
    ]
  },
  {
    "id": "sport-band",
    "handle": "sport-band-lunar-gray",
    "name": "Sport Band",
    "subName": "Waterproof FKM Rubber • Apple Watch 49mm / 45mm",
    "legacyCategory": "Watch",
    "price": 69,
    "compareAtPrice": null,
    "badge": "100% WATERPROOF",
    "tagline": "Designed for High-Intensity Workouts and Rugged Outdoor Performance",
    "description": "Built from flexible FKM fluoroelastomer rubber, Sport Band is comfortable, lightweight, and durable enough to withstand extreme conditions. Molded interior ventilation channels and full-length adjustment holes provide all-day breathability and moisture management.",
    "features": [
      "100% waterproof and sweatproof FKM fluoroelastomer rubber",
      "Interior ventilation grooves allow airflow and rapid water evaporation",
      "Custom anodized aluminum pin-and-tuck closure mechanism",
      "Micro-textured matte finish feels soft and smooth against skin",
      "Naturally resistant to high temperatures, oils, and chemicals",
      "Engineered specifically for Apple Watch Ultra 2/1 and 45mm/46mm sizes"
    ],
    "specs": {
      "Materials": "Compression-molded high grade FKM rubber, 316 stainless steel pin",
      "Water Resistance": "100% waterproof for ocean swimming, diving, and workouts",
      "Wrist Size Compatibility": "Resistant fit for wrist sizes 150mm to 200mm",
      "Hardware": "Custom-designed matte black / silver stainless steel pin",
      "Compatibility": "Apple Watch Ultra 2, Ultra 1 (49mm), Series 10 (46mm), Series 9/8/7 (45mm)"
    },
    "colors": [
      {
        "id": "lunar-gray",
        "name": "Lunar Gray",
        "hex": "#9E9FA3",
        "imageIndex": 0
      },
      {
        "id": "volcanic-ash",
        "name": "Volcanic Ash",
        "hex": "#2B2B2C",
        "imageIndex": 1
      },
      {
        "id": "ultra-orange",
        "name": "Ultra Orange",
        "hex": "#FF5A00",
        "imageIndex": 2
      },
      {
        "id": "atlantic-blue",
        "name": "Atlantic Blue",
        "hex": "#23415E",
        "imageIndex": 3
      }
    ],
    "images": [
      "https://cdn.shopify.com/s/files/1/0384/6721/files/sport-band-45mm-lunar-gray-front.jpg?v=1731517374&width=1200",
      "https://cdn.shopify.com/s/files/1/0384/6721/products/sport-band-45mm-lunar-gray-back.jpg?v=1731517374&width=1200",
      "https://cdn.shopify.com/s/files/1/0384/6721/files/sport-band-45mm-ultra-orange-back-view.jpg?v=1731517374&width=1200",
      "https://cdn.shopify.com/s/files/1/0384/6721/files/sport-band-45mm-ultra-orange-closeup.jpg?v=1731517374&width=1200",
      "https://cdn.shopify.com/s/files/1/0384/6721/files/apple-watch-sport-band-45mm-lunar-gray-closeup.jpg?v=1731517374&width=1200"
    ]
  },
  {
    "id": "card-wallet-plus",
    "handle": "card-wallet-plus-black",
    "name": "Card Wallet Plus",
    "subName": "Horween® Leather • Holds 16 Cards",
    "legacyCategory": "Tracking & Wallets",
    "price": 109,
    "compareAtPrice": 125,
    "badge": "PATINA GUARANTEE",
    "tagline": "Slim, Rigid Leather Wallet Engineered to Hold Up to 16 Cards and Cash",
    "description": "Card Wallet Plus combines the tradition of Horween leather with modern thermoforming technology. The leather is bonded to a thin core structure to prevent stretching over time, ensuring your cards stay securely in place forever.",
    "features": [
      "Vegetable-tanned Horween leather from Chicago",
      "Holds up to 16 cards plus folded banknotes in center cash slot",
      "Thermoformed structure retains its shape without loosening or stretching",
      "External quick-access card slots for your primary transit or credit card",
      "RFID-shielding layers protect against electronic scanning",
      "Patina deepens beautifully with everyday handling"
    ],
    "specs": {
      "Capacity": "Up to 16 standard plastic cards + folded bills",
      "Materials": "Horween full-grain leather, thermoformed microfiber polymer core, bonded nylon stitching",
      "Dimensions": "103mm x 72mm x 12mm",
      "Weight": "52g (1.8 oz)",
      "Warranty": "2 Year Craftsmanship Guarantee"
    },
    "colors": [
      {
        "id": "black",
        "name": "Black Horween",
        "hex": "#1A1A1A",
        "imageIndex": 0
      },
      {
        "id": "rustic-brown",
        "name": "Rustic Brown",
        "hex": "#6F4528",
        "imageIndex": 1
      },
      {
        "id": "natural",
        "name": "Natural Horween",
        "hex": "#C29B72",
        "imageIndex": 2
      }
    ],
    "images": [
      "https://cdn.shopify.com/s/files/1/0384/6721/files/856500019536_856500019536_C.jpg?v=1749145089&width=1200",
      "https://cdn.shopify.com/s/files/1/0384/6721/files/856500019536_856500019536_D.jpg?v=1749145089&width=1200",
      "https://cdn.shopify.com/s/files/1/0384/6721/files/856500019536_856500019536_E.jpg?v=1749145089&width=1200",
      "https://cdn.shopify.com/s/files/1/0384/6721/files/856500019536_856500019536_F.jpg?v=1749145089&width=1200",
      "https://cdn.shopify.com/s/files/1/0384/6721/files/856500019536_856500019536_G.jpg?v=1749145089&width=1200"
    ]
  },
  {
    "id": "chargekey",
    "handle": "chargekey-v2-silver",
    "name": "ChargeKey",
    "subName": "Ultra-Compact Keychain Cable • 240W Fast Charge",
    "legacyCategory": "Charging",
    "price": 35,
    "compareAtPrice": null,
    "badge": "EDC ESSENTIAL",
    "tagline": "The World's Most Compact USB-C Cable for Your Daily Keychain",
    "description": "Never find yourself without a charging cable again. ChargeKey is a credit-key sized USB-C to USB-C cable that securely snaps onto your keychain with strong neodymium magnets. Built with zinc alloy housings and capable of delivering up to 240W Power Delivery.",
    "features": [
      "USB-C to USB-C charging always attached to your keychain",
      "High-power 240W Power Delivery for fast charging MacBooks, iPads, and iPhones",
      "Magnetic lock keeps cable securely looped on keys",
      "Electroplated cast zinc alloy connector tips resist scratches and drops",
      "Flexible ribbed TPU braided cable jacket withstands thousands of bends",
      "Ultra-lightweight: weighs less than half an ounce"
    ],
    "specs": {
      "Connector Types": "USB-C to USB-C",
      "Power Delivery": "Supports up to 240W (48V / 5A) USB-PD 3.1 Extended Power Range",
      "Data Transfer": "USB 2.0 (480 Mbps)",
      "Materials": "Cast electroplated zinc alloy shells, flexible TPU core, neodymium magnets",
      "Dimensions": "75mm length unfolded, 12mm width",
      "Weight": "18g (0.63 oz)"
    },
    "colors": [
      {
        "id": "silver",
        "name": "Silver Anodized",
        "hex": "#C0C0C2",
        "imageIndex": 0
      },
      {
        "id": "midnight",
        "name": "Midnight Black",
        "hex": "#1B1B1C",
        "imageIndex": 1
      }
    ],
    "images": [
      "https://cdn.shopify.com/s/files/1/0384/6721/files/856504017644_A.jpg?v=1733352726&width=1200",
      "https://cdn.shopify.com/s/files/1/0384/6721/files/856504017644_E.jpg?v=1733352726&width=1200",
      "https://cdn.shopify.com/s/files/1/0384/6721/files/856504017644_G.jpg?v=1733352726&width=1200",
      "https://cdn.shopify.com/s/files/1/0384/6721/files/856504017644_H.jpg?v=1733352726&width=1200",
      "https://cdn.shopify.com/s/files/1/0384/6721/files/856504017644_B.jpg?v=1733352726&width=1200"
    ]
  }
]
