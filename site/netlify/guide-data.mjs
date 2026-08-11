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
      'Everything you need for a great stay in Shap and the wider Lake District — where to eat, drink, shop and explore. Booking is worth doing almost everywhere between Easter and October, and on any Sunday; several places are small and shut two or three days a week, so a quick call the day before saves a wasted drive. All distances are driving times from the door unless a walk is noted.',
    groups: [
      {
        name: 'Eat & Drink — Our Quick Picks',
        items: [
          { name: 'Breakfast, lunch or cake', note: 'Birchwood Cafe, in the village — 5 min walk.' },
          { name: 'Something tonight, no car', note: 'Shap Chippy or the Crown Inn — 5 min walk.' },
          { name: 'The best pub meal nearby', note: 'The Butchers Arms, Crosby Ravensworth — 10 min.' },
          { name: 'A special occasion', note: 'Allium at Askham Hall (15 min) or 1863 at Pooley Bridge (25 min).' },
          { name: 'Sunday lunch', note: 'George and Dragon, Clifton — 15 min.' },
          { name: 'Somewhere with a view', note: 'The Brackenrigg Inn, Watermillock — 30 min.' },
          { name: 'Kids and dogs in tow', note: 'The Sun Inn, Pooley Bridge — 25 min.' },
          { name: 'Vegetarian or vegan', note: 'Simple Goodness, Penrith (20 min) or Baba Ganoush, Kendal (30 min).' },
          { name: 'Pizza, no booking', note: 'The Queen’s Head, Askham — 15 min.' },
          { name: 'A wet afternoon to fill', note: 'Larch Cottage Nurseries, Melkinthorpe — 18 min.' },
        ],
      },
      {
        name: 'Eat & Drink — In Shap (walkable)',
        items: [
          {
            name: 'Birchwood Cafe',
            meta: '5 min walk · Main Street',
            note: 'Our first recommendation — everything made from scratch, superb cakes (the sticky ginger especially), excellent coffee and a proper all-day breakfast. Walker, cyclist, dog and child friendly, with outdoor seating.',
            link: 'https://www.birchwoodcafeshap.com',
          },
          {
            name: 'Shap Chippy',
            meta: '5 min walk · Cleveland House',
            note: 'The most useful address in the village — properly cooked fish and a menu that goes well beyond fish & chips (curry specials too). Closed Mondays; lunch 12–1.30, evenings from 4. Last orders are 7pm for eating in and 7.30pm for takeaway — don’t be late, they close sharpish!',
            link: 'https://shapchippy.co.uk',
          },
          {
            name: 'Crown Inn',
            meta: '5 min walk · 01931 601122',
            note: 'Village local with a wood stove, pool and darts, and a separate dining room. Hearty, generous pub cooking under new management; good with dogs and walkers. Find them on Facebook.',
          },
          {
            name: 'Kings Arms Hotel',
            meta: '8 min walk · Main Street',
            note: 'Friendly bar with pool, darts and the football — go for a drink and eat at Birchwood or the Crown.',
            link: 'https://kingsarmsshap.co.uk',
          },
        ],
      },
      {
        name: 'Eat & Drink — Nearby Villages (10–20 min)',
        items: [
          {
            name: 'The Butchers Arms, Crosby Ravensworth',
            meta: '10 min · CA10 3JP',
            note: 'The best pub food within easy reach — community-owned, rated 4.8. Chicken wellington, steak pie, proper Sunday roasts, log burners, dog-friendly. Closed Mondays; book ahead, it fills.',
            link: 'https://www.thebutcherscrosby.co.uk',
          },
          {
            name: 'The Mardale Inn, Bampton',
            meta: '12 min · CA10 2RQ',
            note: 'A warm community pub with a short, well-judged menu and good beer — a lovely stop after Haweswater or the Wainwright walks. Evenings only Mon–Thurs.',
            link: 'https://www.themardaleinn.com/',
          },
          {
            name: 'Mill Yard Café & Bistro, Morland',
            meta: '12 min · CA10 3AZ',
            note: 'Pretty village setting overlooking the beck. Wood-fired pizza on Friday evenings and tapas on Saturdays; daytime Wed–Sun 9.30–4. Book at weekends.',
            link: 'https://www.millyardcafe.co.uk',
          },
          {
            name: 'Larch Cottage Nurseries & La Casa Verde, Melkinthorpe',
            meta: '18 min · 01931 712404',
            note: 'A lovely afternoon out — a plantsman’s nursery with a chapel, lake and gallery, plus a terraced Mediterranean restaurant, very good homemade cakes and proper coffee. Open daily from 9am.',
            link: 'https://larchcottage.co.uk',
          },
          {
            name: 'The Punchbowl Inn, Askham',
            meta: '15 min · CA10 2PF',
            note: '18th-century inn on the green, beams and stone floors; the kitchen is closer to restaurant cooking than pub grub. Open all day, every day.',
            link: 'https://www.punchbowlinnaskham.com',
          },
          {
            name: 'The Queen’s Head, Askham',
            meta: '15 min · CA10 2PF',
            note: 'Now wood-fired pizza only, and excellent — no bookings, just turn up. Food 12.30–3 and 4–8.30.',
            link: 'https://www.queensheadaskham.co.uk',
          },
          {
            name: 'Allium at Askham Hall',
            meta: '15 min · CA10 2PF',
            note: 'The Michelin star on your doorstep — a six-course tasting menu, mostly grown or reared on the estate, in a 14th-century pele tower. Around £140pp. Tue–Sun; book weeks ahead.',
            link: 'https://www.askhamhall.co.uk',
          },
          {
            name: 'George and Dragon, Clifton',
            meta: '15 min · CA10 2ER',
            note: 'An 18th-century coaching inn — estate beef, pork and venison, homegrown veg, and one of the best Sunday lunches in Cumbria. Food 12–2.30 and 6–9.',
            link: 'https://georgeanddragonclifton.co.uk',
          },
          {
            name: 'Orton Scar Cafe, Orton',
            meta: '15 min · Orton',
            note: 'Simple fare — bacon buns, canned drinks and the like — with the option to eat in or take away. A handy stop while exploring the Orton fells.',
            link: 'https://maps.app.goo.gl/xN4rBV1mvxcxEkto6',
            linkLabel: 'View on map ↗',
          },
          {
            name: 'The George Hotel, Orton',
            meta: '15 min · CA10 3RJ',
            note: 'Friendly village pub popular with Coast to Coast walkers — great-value Sunday lunch, good with gluten-free. Opens 3pm weekdays.',
            link: 'https://georgeorton.co.uk/',
          },
          {
            name: 'Kennedys Fine Chocolates, Orton',
            meta: '15 min · CA10 3RU',
            note: 'Chocolate factory with a coffee house, shop and homemade ice cream — a good rainy-afternoon idea. Mon–Sat 9–5, Sun 10–5.',
            link: 'https://www.kennedyschocolates.co.uk',
          },
          {
            name: 'Tebay Services Farmshop & Kitchen',
            meta: '12 min · M6 J38',
            note: 'The best motorway services in Britain, owned by a Cumbrian farming family — a proper farm shop for local meat, cheese and bread, plus a self-service kitchen doing real cooking.',
            link: 'https://www.tebayservices.com',
          },
          {
            name: 'Cross Keys Inn, Tebay',
            meta: '15 min · 015396 24240',
            note: 'Traditional roadside inn just off J38 — straightforward and dependable.',
            link: 'https://crosskeysinntebay.co.uk/',
          },
        ],
      },
      {
        name: 'Eat & Drink — Penrith (~20 min)',
        items: [
          {
            name: 'Four & Twenty',
            meta: '01768 210231 · King Street',
            note: 'A family-run bistro in a converted bank near the market square — the best cooking in the town centre and a great-value set menu. Lunch and dinner Tue–Sat; book.',
            link: 'http://www.fourandtwentypenrith.co.uk',
          },
          {
            name: 'Grants of Castlegate',
            meta: '01768 895444 · Castlegate',
            note: 'Modern bistro and wine bar in a Victorian building — souffles, seafood and a well-judged wine list. Dinner Wed–Sun.',
          },
          {
            name: 'La Casita',
            meta: '01768 868202 · Queen Street',
            note: 'Spanish tapas done properly with Cumbrian ingredients — paella cooked to order (allow 45 min). Evenings only, closed Mondays; one of the few good Sunday-evening options.',
          },
          {
            name: 'Favilla by Smoke & Steel',
            meta: '01768 868666 · Castlegate',
            note: 'Steak and fire-cooking — picanha, flat iron, pork belly bites. Relaxed and good for a date night; closed Mondays.',
          },
          {
            name: 'Simple Goodness',
            meta: '01768 630391 · Castlegate',
            note: 'Daytime plant-based cafe — the answer when a vegan or vegetarian wants to eat well. Homemade everything, 11.30–3ish, closed Sundays.',
          },
          {
            name: 'Angel Lane Chippie',
            meta: 'Angel Lane',
            note: 'Penrith’s oldest chip shop, running since 1928 — worth the detour if you’re already in town.',
          },
        ],
      },
      {
        name: 'Eat & Drink — Ullswater (25–40 min)',
        items: [
          {
            name: '1863, Pooley Bridge',
            meta: '25 min · CA10 2NH',
            note: 'The destination restaurant of the valley — Michelin-listed, with a tasting menu and a shorter à la carte. Small, so book well ahead; closed Tue–Wed.',
            link: 'https://1863ullswater.co.uk',
          },
          {
            name: 'The Pooley Bridge Inn',
            meta: '25 min · 017684 86215',
            note: 'Traditional bar with open fires and a courtyard garden; dependable pub food and a well-followed sticky toffee pudding.',
            link: 'https://pooleybridgeinn.co.uk',
          },
          {
            name: 'The Sun Inn, Pooley Bridge',
            meta: '25 min · 017684 86205',
            note: 'Big beer garden, children’s play area and a log fire — the best value of the village pubs, family- and dog-friendly.',
            link: 'https://www.suninnpooleybridgepub.co.uk',
          },
          {
            name: 'Granny Dowbekins, Pooley Bridge',
            meta: '25 min · 017684 86453',
            note: 'Riverside tearoom and garden — breakfasts, scones, sandwiches, gluten-free options, dogs welcome. Daily 9–5; the riverside tables go first.',
          },
          {
            name: 'The Secret Garden, Pooley Bridge',
            meta: '25 min · 017684 86266',
            note: 'Through a village shop into a smart riverside dining room — steak sandwiches, burgers, duck. Worth booking a riverside table.',
          },
          {
            name: 'The Brackenrigg Inn, Watermillock',
            meta: '30 min · 017684 86442',
            note: 'Lakeside inn with two beer gardens and views down Ullswater — good fish and chips and a solid Sunday roast. (Neighbouring Another Place opens its restaurants to non-residents too.)',
          },
          {
            name: 'Fellbites, Glenridding',
            meta: '35 min · 017684 82781',
            note: 'Cafe and restaurant near the steamer pier — burritos, loaded fries, pies and a big cake selection. Closed Tuesdays; hours vary, so check.',
          },
          {
            name: 'Helvellyn Country Kitchen, Glenridding',
            meta: '35 min · 017684 82598',
            note: 'The better Glenridding breakfast before a big walk — generous portions, good with dietary needs, dog-friendly. Wed–Sun.',
          },
          {
            name: 'Traveller’s Rest, Glenridding',
            meta: '35 min · 017684 82298',
            note: 'A proper walkers’ pub above the village with two open fires — exactly what you want after Helvellyn.',
          },
          {
            name: 'Lakeside Tearoom, Glenridding',
            meta: '35 min · 017684 82393',
            note: 'Small tearoom with a view straight down the lake — breakfast, soup, cheese scones. Daily 9–5.',
          },
        ],
      },
      {
        name: 'Eat & Drink — Kendal (~30 min)',
        items: [
          {
            name: 'Comida',
            meta: '01539 732082 · Highgate',
            note: 'Spanish-inspired small plates and the town’s most consistently praised restaurant — patatas bravas, Valencian fried chicken, churros. Weekend brunch too; booking essential.',
          },
          {
            name: 'Ramble by Northern Wine',
            meta: '07849 115253 · Stramongate',
            note: 'A small-plates restaurant attached to a Kendal winery — bold cooking, an offbeat wine list and an exceptional Sunday roast. Thurs–Sun only; book ahead.',
          },
          {
            name: 'Baba Ganoush',
            meta: '01539 738210 · Finkle Street',
            note: 'Vegetarian canteen down an alley — big salad bar, homemade bread and cakes. Daytime Mon–Sat, and rammed at lunch.',
            link: 'https://baba-ganoush.co.uk',
          },
          {
            name: 'Pedro’s Casa',
            meta: '01539 722332 · Stricklandgate',
            note: 'Tapas and Mexican with a hands-on owner — sweetcorn fritters, gambas, enchiladas. Closed Wednesdays; kitchen shuts early (~8pm).',
          },
          {
            name: 'Bombay Bistro',
            meta: '01539 332306 · Stramongate',
            note: 'The best Indian for miles — big menu, fresh cooking, reasonable prices. Open every evening.',
          },
          {
            name: 'Araya Thai',
            meta: '01539 723123 · Highgate',
            note: 'Authentic and consistently good — tom yum, massaman, mango sticky rice, with lots of dairy-free and vegan options. Closed Mondays.',
          },
          {
            name: 'The Joshua Tree',
            meta: '01539 737223 · Stramongate',
            note: 'Cafe-bistro in a 16th-century yard building with a lovely sheltered terrace. Daytime Tue–Sat 9.30–3.',
          },
          {
            name: '5 O’Clock Somewhere',
            meta: '01539 324940 · Finkle Street',
            note: 'Small wine bar doing flights and charcuterie boards — good for a drink before dinner elsewhere. Wed–Sun.',
          },
          {
            name: 'La Luna',
            meta: '01539 324478 · Highgate',
            note: 'Italian in a handsome old building — reliable pizza and pasta, open every day.',
          },
        ],
      },
      {
        name: 'Shops & Essentials',
        items: [
          {
            name: 'Co-op / village shop',
            note: 'The Co-op in the village has a little of everything you’ll need — groceries, essentials and the morning paper. Open 7am–10pm, with a free-to-use cashpoint outside.',
          },
          {
            name: 'Major supermarkets',
            note: 'For a serious shop, the closest big supermarkets are in Penrith (15–20 min) and Kendal (20–25 min) — including Booths.',
          },
          {
            name: 'Fuel, cash & pharmacy',
            note: 'Free-to-use cashpoint at the Co-op in the village. Nearest fuel is Tebay Services (handy but pricey); for cheaper filling up, the Esso garage on the A6 into Penrith (Bridge Lane, CA11 8JB — over the roundabout) or on into Kendal. The nearest pharmacy is in Penrith (about 15–20 min).',
          },
        ],
      },
      {
        name: 'Out & About',
        items: [
          { name: 'The fells & open moorland', note: 'On the doorstep — walking straight from the village, or ~15 min to the higher fells.' },
          { name: 'Shap Swimming Pool', note: 'A heated open-air community pool in the village, run by volunteers and open through the summer season — a lovely spot on a warm day, and walkable from the door.' },
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
      // Hidden for now (The Rockery isn't taking bookings yet). Remove this
      // line to show the tab again — all its content below is preserved.
      hidden: true,
      tagline: 'Grade II Listed house · sleeps 9',
      sections: [
        {
          title: 'Arrival & Keys',
          body: 'There is a key safe in the passageway between the cottage and the main house. The exact lockbox location and code are sent to you on the day of arrival. Check-in is from 3pm, though we’re happy to accommodate an earlier check-in where we can — just ask.',
        },
        {
          title: 'Wi-Fi',
          fields: [
            { label: 'Network', value: 'Lake District Escapes' },
            { label: 'Password', value: 'BeMyGuest2026' },
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
            'Cooking oils, salt and pepper are provided, plus tea, coffee and sugar.',
            'You’ll also find a teapot, a cafetière and a French coffee press, with coffee to see you through the first few days.',
          ],
        },
        {
          title: 'TV & Entertainment',
          body: 'The Amazon Fire TV is connected to the Wi-Fi and gives you a range of streaming apps — Netflix, Amazon Prime and Apple TV, as well as BBC, ITV, Channel 4 and Channel 5. Simply switch the TV on with the remote control and navigate to your preferred app. You’ll need to sign in with your own personal streaming accounts. Sky TV and Sky Cinema are also available in the house.',
        },
        {
          title: 'Bins & Recycling',
          body: 'All household waste — including plastics, tins and glass — goes in the bins provided. Please dispose of dog poo in the outside bins by the woodshed.',
        },
        {
          title: 'Parking',
          body: 'Parking for up to 3 cars. [[Exactly where to park.]]',
        },
        {
          title: 'Before You Leave',
          items: [
            'Check out by 10:00am.',
            'Please strip nothing / leave beds as-is — [[your preference]]',
            'Pop the bins out if it’s collection day, load & start the dishwasher, and turn off the heating.',
            '[[Where to leave the keys.]]',
          ],
        },
        {
          title: 'Help & Emergencies',
          fields: [
            { label: 'Your hosts', value: 'Holly 07771 346748 · Mel 07720 840898' },
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
          body: 'Primrose Cottage has its own private entrance and key. There is a key safe in the passageway between the cottage and the main house — the exact lockbox location and code are sent to you on the day of arrival. Check-in is from 3pm, though we’re happy to accommodate an earlier check-in where we can — just ask.',
        },
        {
          title: 'Wi-Fi',
          fields: [
            { label: 'Network', value: 'Lake District Escapes' },
            { label: 'Password', value: 'BeMyGuest2026' },
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
            'Induction hob & oven — the hob only heats magnetic pans, and all the pans provided work with it.',
            'Fridge, microwave, kettle and toaster are all provided.',
            'Everything you need to cook a proper meal: pots, pans, baking trays, knives, crockery and glassware.',
            'Cooking oils, salt and pepper are provided, plus tea, coffee and sugar.',
            'You’ll also find a teapot, a cafetière and a French coffee press, with coffee to see you through the first few days.',
          ],
        },
        {
          title: 'Your Welcome Pack',
          body: 'On arrival the kitchen is loaded with milk, tea, coffee and cereal to see you through the first morning. Told us your dietary needs or milk preference at booking? It’ll already be sorted.',
        },
        {
          title: 'TV & Entertainment',
          body: 'The Amazon Fire TV is connected to the Wi-Fi and gives you a range of streaming apps — Netflix, Amazon Prime and Apple TV, as well as BBC, ITV, Channel 4 and Channel 5. Simply switch the TV on with the remote control and navigate to your preferred app. You’ll need to sign in with your own personal streaming accounts.',
        },
        {
          title: 'Drying Wet Gear',
          body: 'We provide two drying racks — one upstairs and one downstairs — for drying wet clothes and jackets.',
          items: [
            'Please take off wet jackets and all shoes as you come into the cottage.',
            'You’ll find coat hooks for jackets and a shoe rack for any wet, muddy or dusty shoes.',
            'Please use the larger downstairs rack in the kitchen, so the carpet doesn’t get wet and spoiled.',
          ],
        },
        {
          title: 'Bins & Recycling',
          body: 'All household waste — including plastics, tins and glass — goes in the bins provided. Please dispose of dog poo in the outside bins by the woodshed.',
        },
        {
          title: 'Bikes & Luggage Transfer',
          body: 'Secure bicycle storage is available by prior arrangement, subject to space. On the long-distance trails, luggage-transfer services can drop and collect bags here — just let us know.',
        },
        {
          title: 'Before You Leave',
          items: [
            'Check out by 10:00am.',
            'Please put all wet towels in the shower cubicle.',
            'Put any rubbish from the bathroom bin into the kitchen bin.',
            'Turn off the heating and the fan heater.',
            'Leave the key back in the lockbox and lock the keys in.',
          ],
        },
        {
          title: 'Help & Emergencies',
          body: 'In a genuine emergency always dial 999. For anything that isn’t obviously an emergency, call NHS 111 first — they can direct you to the right place and save a wasted drive to a unit that’s closed.',
          items: [
            {
              text: '24-hour A&E — Cumberland Infirmary, Newtown Road, Carlisle CA2 7HY. The closest, about 30 miles / 40 min via the M6, and the main acute and trauma site for north and east Cumbria. Open 24 hours, every day · switchboard 01228 523444.',
              link: 'https://www.aewaittime.co.uk/hospitals/cumberland-infirmary-carlisle',
              linkLabel: 'Check A&E wait time ↗',
            },
            {
              text: '24-hour A&E — Royal Lancaster Infirmary, Ashton Road, Lancaster LA1 4RP. About 40 miles / 50 min via the M6; a straight run south if you’re already heading that way. Open 24 hours, 7 days a week.',
              link: 'https://www.aandewaittimes.uk/hospital/royal-lancaster-infirmary',
              linkLabel: 'Check A&E wait time ↗',
            },
            {
              text: 'Urgent treatment centre (sprains, suspected simple fractures, cuts, minor burns and head injuries) — Penrith Community Hospital, Bridge Lane, Penrith CA11 8HX. 10 miles / 20 min, open daily 8am–10pm · 01768 245555 (option 1). On-site X-ray runs Mon–Fri 8.30am–4.30pm only, so a weekend suspected fracture may be sent on to Carlisle.',
              link: 'https://www.aewaittime.co.uk/hospitals/penrith-community-hospital',
              linkLabel: 'Check wait time ↗',
            },
            {
              text: 'Urgent treatment centre — Westmorland General, Burton Road, Kendal LA9 7RG. 16 miles / 30 min, open daily 8am–11pm (last appointment 10pm), X-ray 9am–8pm with overnight on-call — better weekend X-ray cover than Penrith.',
              link: 'https://www.aewaittime.co.uk/hospitals/westmorland-general-hospital',
              linkLabel: 'Check wait time ↗',
            },
            {
              text: 'Urgent treatment centre — Keswick Hospital, Crosthwaite Road CA12 5PH. 30 miles / 50 min, open daily 8.30am–6pm; only really relevant if you’re already over that side.',
              link: 'https://www.ncic.nhs.uk/services/urgent-treatment-centre',
              linkLabel: 'More info ↗',
            },
          ],
          fields: [
            { label: 'Your hosts', value: 'Holly 07771 346748 · Mel 07720 840898' },
            { label: 'Fuse board', value: '[[ location ]]' },
            { label: 'what3words', value: '///arrival.snowballs.attic' },
          ],
        },
      ],
    },
  },
};
