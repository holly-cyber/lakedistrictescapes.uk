// ─────────────────────────────────────────────────────────────────────────
// GUEST GUIDE CONTENT
//
// This is the digital welcome guide shown at guest.lakedistrictescapes.uk
// AFTER a guest enters the access code. It is served by the guest-guide
// Netlify Function, so it never appears in the public page source.
//
// HOW TO EDIT:
//   • Replace every [[ bracketed placeholder ]] with your real details.
//   • `fields` render as label / value rows (great for Wi-Fi, codes, times).
//   • `items` render as a bullet list. `body` renders as a paragraph.
//   • Add or remove sections freely — the page adapts.
// ─────────────────────────────────────────────────────────────────────────

export const GUIDE = {
  area: {
    title: 'Explore the Area',
    intro:
      'Everything you need for a great stay in Shap and the wider Lake District — where to eat, shop and explore, most of it within a short walk or a short drive.',
    groups: [
      {
        name: 'Eat & Drink',
        items: [
          {
            name: 'Village pubs',
            note: 'Shap has pubs within walking distance serving food and local ales. [[Add pub names, food times & opening hours]]',
          },
          {
            name: 'Fish & chips',
            note: 'The village chip shop is a local favourite for a proper Lakeland supper. [[Add name, days & hours]]',
          },
          {
            name: 'Cafe',
            note: 'Coffee, breakfast or lunch in the village. [[Add cafe name & opening hours]]',
          },
          {
            name: 'Further afield',
            note: 'Penrith (15 min) and Kendal (20 min) have plenty more places to eat and drink.',
          },
        ],
      },
      {
        name: 'Shops & Essentials',
        items: [
          {
            name: 'Co-op / village shop',
            note: 'Groceries, essentials and the morning paper in the village. [[Add Co-op opening hours]]',
          },
          {
            name: 'Bigger food shop',
            note: 'Booths supermarket in Penrith (15 min north up the A6) for a serious shop.',
          },
          {
            name: 'Fuel, cash & pharmacy',
            note: '[[Add nearest petrol station, cash machine and pharmacy]]',
          },
        ],
      },
      {
        name: 'Out & About',
        items: [
          { name: 'The fells & open moorland', note: 'On the doorstep — walking straight from the village, or ~15 min to the higher fells.' },
          { name: 'Haweswater & Mardale', note: '~15 min — quiet valley, great walking and red squirrel country.' },
          { name: 'Ullswater & Pooley Bridge', note: '~25 min — steamers, lakeside walks and Aira Force.' },
          { name: 'Keswick & Derwentwater', note: '~40 min — launches, Catbells and the northern fells.' },
          { name: 'Windermere & Ambleside', note: '~45–50 min — the classic central Lakes day out.' },
          { name: 'Penrith & Kendal', note: 'Market towns 15–20 min away for shops, cafes and a rainy day.' },
        ],
      },
    ],
  },

  properties: {
    'the-rockery': {
      name: 'The Rockery',
      tagline: 'Grade II Listed house · sleeps 9',
      sections: [
        {
          title: 'Arrival & Keys',
          body: '[[How to get in — key safe location & code, or where to collect keys. Check-in from HH:MM.]]',
        },
        {
          title: 'Wi-Fi',
          fields: [
            { label: 'Network', value: '[[ network name ]]' },
            { label: 'Password', value: '[[ password ]]' },
          ],
        },
        {
          title: 'Heating & Hot Water',
          body: 'Central heating and hot water throughout, controlled by a Hive thermostat. To turn the heating on manually:',
          items: [
            'Wake up the screen by pressing any button or tapping the dial.',
            'Turn the dial (or press the up/down arrows) to raise the target temperature higher than your current room temperature — the heating will come on.',
            'The fan heater can be found under the stairs if you’d like a quick extra boost.',
          ],
        },
        {
          title: 'The Log Burner',
          body: 'A charming wood burner in the living room — logs are provided.',
          items: [
            '[[Step 1 — open the air vents fully]]',
            '[[Step 2 — lay kindling & firelighter, light, add logs as it catches]]',
            '[[Step 3 — adjust the vents to control the burn]]',
            'Please use the fireguard and never leave the fire unattended.',
          ],
        },
        {
          title: 'Kitchen & Appliances',
          items: [
            '[[Oven & hob — type and any quirks]]',
            '[[Dishwasher — tablets are under the sink; eco cycle takes ~Xh]]',
            '[[Washing machine — location & detergent]]',
            'Microwave, kettle, toaster and the usual cookware are all provided.',
          ],
        },
        {
          title: 'TV & Entertainment',
          body: '[[Smart TV in the living room — how to turn it on and which streaming apps are available.]]',
        },
        {
          title: 'Bins & Recycling',
          body: '[[Which bins, where they live, and collection day. General waste vs recycling.]]',
        },
        {
          title: 'Parking',
          body: 'Parking for up to 3 cars. [[Exactly where to park.]]',
        },
        {
          title: 'Before You Leave',
          items: [
            '[[Check-out by HH:MM]]',
            'Please strip nothing / leave beds as-is — [[your preference]]',
            'Pop the bins out if it’s collection day, load & start the dishwasher, and turn off the heating.',
            '[[Where to leave the keys.]]',
          ],
        },
        {
          title: 'Help & Emergencies',
          fields: [
            { label: 'Your hosts', value: '[[ name & phone number ]]' },
            { label: 'Water stop-tap', value: '[[ location ]]' },
            { label: 'Fuse board', value: '[[ location ]]' },
            { label: 'Nearest A&E', value: 'Penrith / Carlisle — dial 999 in an emergency' },
          ],
        },
      ],
    },

    'primrose-cottage': {
      name: 'Primrose Cottage',
      tagline: 'Self-contained one-bedroom cottage · sleeps 2 (+1 under 2)',
      sections: [
        {
          title: 'Arrival & Keys',
          body: 'Primrose Cottage has its own private entrance and key. [[Key safe location & code, or where to collect keys. Check-in from HH:MM.]]',
        },
        {
          title: 'Wi-Fi',
          fields: [
            { label: 'Network', value: '[[ network name ]]' },
            { label: 'Password', value: '[[ password ]]' },
          ],
        },
        {
          title: 'Heating & the Fan Heater',
          body: 'Central heating throughout, controlled by a Hive thermostat, plus a fan heater so you can come in off the fells and be warm within minutes. To turn the heating on manually:',
          items: [
            'Wake up the screen by pressing any button or tapping the dial.',
            'Turn the dial (or press the up/down arrows) to raise the target temperature higher than your current room temperature — the heating will come on.',
            'The fan heater can be found under the stairs.',
          ],
        },
        {
          title: 'Kitchen & Appliances',
          items: [
            'Induction hob & oven — the hob only heats magnetic pans, and all the pans provided work with it. [[Any control quirks.]]',
            'Fridge, microwave, kettle and toaster are all provided.',
            'Everything you need to cook a proper meal: pots, pans, baking trays, knives, crockery and glassware.',
          ],
        },
        {
          title: 'Your Welcome Pack',
          body: 'On arrival the kitchen is loaded with milk, tea, coffee and cereal to see you through the first morning. Told us your dietary needs or milk preference at booking? It’ll already be sorted.',
        },
        {
          title: 'TV & Entertainment',
          body: '[[Digital TV in the sitting room — how to turn it on and tune/stream.]]',
        },
        {
          title: 'Drying Wet Gear',
          body: 'There’s a drying rack for damp walking gear, and hooks and a shoe rack by the door for wet coats and boots.',
        },
        {
          title: 'Bins & Recycling',
          body: '[[Which bins, where they live, and collection day.]]',
        },
        {
          title: 'Bikes & Luggage Transfer',
          body: 'Secure bicycle storage is available by prior arrangement, subject to space. On the long-distance trails, luggage-transfer services can drop and collect bags here — just let us know.',
        },
        {
          title: 'Before You Leave',
          items: [
            '[[Check-out by HH:MM]]',
            'Please pop the bins out if it’s collection day and turn off the heating and fan heater.',
            '[[Where to leave the key.]]',
          ],
        },
        {
          title: 'Help & Emergencies',
          fields: [
            { label: 'Your hosts', value: '[[ name & phone number ]]' },
            { label: 'Fuse board', value: '[[ location ]]' },
            { label: 'Nearest A&E', value: 'Penrith / Carlisle — dial 999 in an emergency' },
          ],
        },
      ],
    },
  },
};
