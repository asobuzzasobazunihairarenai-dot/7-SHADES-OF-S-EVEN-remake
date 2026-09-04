// English version of the help page data (glossary / FAQ / digital-only features).
// Mirrors help-content.ja.js exactly: same arrays, same order, same object shapes.
// Card names follow card-text.en.js (e.g. purple-sorry = "So Sorry!", rainbow-shard = "Prism Shard").
// UI英語化フェーズ8。日本語の原文は help-content.ja.js（説明書.txt の採録）。

export const DIGITAL_FEATURES_EN = [
  {
    title: "Face-up or face-down is decided for you",
    body: [
      "A card you play from your hand onto a square of the board is turned face-down automatically.",
      "A card you lock from your hand into your Lock Area is turned face-up automatically. (The result is exactly the same as the physical rules — the digital version just saves you the handling.)",
      "Cards sent to the discard pile are turned face-up automatically as well.",
    ],
  },
  {
    title: "Change your piece skin, card back, playmat and background",
    body: [
      "From the icons in your own status area (bottom-left of the screen) you can change your piece skin, card back design, playmat and background image.",
      "These are your personal looks only — they do not affect what other players see.",
      "If you are signed in, the settings are saved to your account automatically and follow you to other devices and browsers.",
    ],
  },
  {
    title: "Change your avatar and nickname",
    body: [
      "Besides the seven prepared avatars, you can use your Google profile picture when signed in with Google, or upload an image of your own.",
      "You can change your nickname at any time.",
    ],
  },
  {
    title: "Card details are always available",
    body: [
      "Hovering over a card on the board shows an enlarged preview.",
      "Right-click a card and choose “View card notes” to read the detailed rules explanation at any time.",
    ],
  },
  {
    title: "Shuffle hand button",
    body: ["Shuffles the order of your own hand. It has no effect on the rules, but it makes it harder for someone watching over your shoulder to tell which card you just handled."],
  },
  {
    title: "The Gate Invasion Bonus is processed automatically",
    body: [
      "If you end your turn with your piece standing on an opponent's gate, the bonus — taking half of their hand at random, gaining an Eternal card, and so on — is carried out automatically, with no button pressing.",
    ],
  },
  {
    title: "Contact goes through a confirmation and the defender's approval",
    body: [
      "Drag your piece onto an adjacent opponent's piece and a confirmation prompt appears (to prevent misclicks). Once you request it, the player being contacted decides whether to approve or reject it.",
      "Once approved, taking one random card from their hand and forcing them back to their own gate happens automatically, and the result is shown in a modal along with the animation (the charge, the impact and the card flight).",
    ],
  },
  {
    title: "The final lock needs every other player's approval",
    body: [
      "When you try to lock a card that would win you the game, a dedicated approval flow replaces the normal lock.",
      "Starting from the player on the attacker's left and going clockwise, every other participant must approve before the card is actually locked and the game is won. If even one player rejects it, the pending lock is cancelled and the card does not move.",
    ],
  },
  {
    title: "Turn timer (rope and hourglasses)",
    body: [
      "The rope in the middle of the screen shows how much time you have left. When your base time runs out you can spend an hourglass to extend it. (You can turn this on or off in the options.)",
    ],
  },
  {
    title: "Pass priority button",
    body: ["Lets you hand your priority to another player when something needs to be resolved by them."],
  },
  {
    title: "Card list",
    body: ["“📋 Card list” in the options shows every card contained in the deck."],
  },
  {
    title: "Check your record on My Page",
    body: [
      "The My Page icon in the top right shows your matches, win rate, ranking and so on.",
      "If you link your account with a player in the sister project's battle-record system, your results are collected there automatically.",
    ],
  },
  {
    title: "Shortcut keys, volume and animation settings",
    body: [
      "Right-click a player button (End turn, Draw 1, etc.) to assign any key you like as a shortcut.",
      "Sound-effect and music volume can be adjusted separately in the options.",
      "There are also settings that reduce on-screen effects (glows, animations), so the game stays comfortable if you prefer calmer visuals or play on a slower device.",
    ],
  },
];

// Same order as the Japanese glossary (which follows the printed manual).
export const GLOSSARY_EN = [
  { term: "Opponent", body: ["Any player other than you, or that player's piece."] },
  {
    term: "Gate Invasion",
    body: [
      "Ending a turn with your piece standing on an opponent's gate.",
      "A successful gate invasion earns you a bonus.",
    ],
  },
  { term: "Around an opponent", body: ["The squares surrounding the piece of a player other than you."] },
  {
    term: "Topmost principle",
    body: ["When an effect targets the card on a square and says nothing more specific, it targets the card on top of that square."],
  },
  {
    term: "Player with the most locked cards",
    body: ["The player with the greatest number of cards locked in their own Lock Area."],
  },
  {
    term: "Usable anytime",
    body: [
      "A card with this wording can be used at any time, except while an effect is being resolved.",
      "It may be used immediately after a declaration — for example right after a move, an effect activation or a lock is declared.",
    ],
  },
  {
    term: "Move",
    body: ["Place your piece from its current square onto another square that has a card on it, and reveal that card if it is face-down."],
  },
  {
    term: "Face-down",
    body: ["A card placed so that the side showing its art and effects cannot be seen."],
  },
  {
    term: "Eternal card",
    body: [
      "A special card gained when a gate invasion succeeds.",
      "You can use an Eternal card's Hand Effect during your Hand phase even while it is locked.",
      "This card is never targeted by other cards' effects: it cannot be taken or discarded.",
    ],
  },
  { term: "Reveal", body: ["Turning a face-down card face-up."] },
  {
    term: "Face-up",
    body: ["A card placed so that the side showing its art and effects can be seen."],
  },
  {
    term: "Forced move",
    body: [
      "A “move” that may also go to a square with no card on it.",
      "Place your piece from its current square onto another square, and reveal that card if it is face-down.",
    ],
  },
  {
    term: "Sentence principle",
    body: [
      "A card's effect text is resolved one sentence at a time.",
      "For example, with “Everyone draws 1 card. Everyone moves 1 square.”, everyone first draws a card, and only then does everyone move one square.",
    ],
  },
  {
    term: "Gate",
    body: [
      "The middle square of each of the four edges of the 7×7 field (49 squares).",
      "There is one on each edge, and the one nearest to a player — right in front of them — is that player's own gate.",
    ],
  },
  {
    term: "Show / make public",
    body: [
      "Let every other player see the contents.",
      "If a card says “Draw 1 card and show it.”, you turn the drawn card face-up so that every other player can see what it is.",
      "As a rule, it stops being public at the end of the turn in which it was shown.",
    ],
  },
  { term: "National Treasure Cube", body: ["There are cubes in seven colors; in S:EVEN 0th EDITION they are the “pieces”."] },
  { term: "Piece", body: ["The token a player moves around the board. In the 0th EDITION these are the National Treasure Cubes."] },
  { term: "You", body: ["The player themselves, or that player's piece."] },
  { term: "Surrounding squares", body: ["The 8 squares around a piece (orthogonally and diagonally)."] },
  {
    term: "Resolution order principle",
    body: ["When an effect targets multiple players, resolve it starting from the player who activated the effect (or the turn player if there is none) and continuing clockwise."],
  },
  {
    term: "Discard pile",
    body: [
      "Where cards discarded by Hand Effects and the like are put.",
      "As a rule there is a single discard pile shared by all players. Put it anywhere outside the board.",
      "Discarded cards are stacked face-up.",
    ],
  },
  { term: "Contact", body: ["Take one card at random from an opponent's hand; that opponent is then force-moved back to their own gate."] },
  { term: "S:EVEN", body: ["Short for 7 SHADES OF S:EVEN."] },
  {
    term: "Best-effort principle",
    body: [
      "Players must do their best to satisfy what a card says, as far as it is possible.",
      "For example, if you already know an effect cannot be satisfied, you may not declare that you are using that card from your hand.",
      "An Arrival Effect is gained automatically the moment your piece lands on the card, but if its contents are a choice, you may only choose an option you can actually carry out.",
    ],
  },
  { term: "Turn", body: ["As a rule, from the start of the Lock phase to the end of the Move phase."] },
  {
    term: "Color Cost S",
    body: [
      "Written as 【Color Cost S】.",
      "Pay a color cost of S (discard S cards of the same color as this card from your hand) to gain the effect that follows.",
      "S is a natural number.",
    ],
  },
  { term: "Normal move", body: ["The move you normally make during the Move phase."] },
  { term: "Hand", body: ["The cards a player is holding.", "As a rule you keep them hidden from everyone else, and there is no limit to how many you may hold."] },
  {
    term: "Hand Effect",
    body: [
      "The effect written in the “Hand Effect:” part of a card.",
      "As a rule, while a card with a Hand Effect is in your hand, you can gain that effect during your own Hand phase.",
    ],
  },
  {
    term: "Half your hand",
    body: [
      "Half of your hand — for example, 4 cards if you hold 8.",
      "S:EVEN always rounds down: with 7 cards in hand, half is 3.5, which rounds down to 3.",
    ],
  },
  { term: "Arrival", body: ["The moment a piece is placed onto a face-up card is called an “arrival”."] },
  {
    term: "Arrival Effect",
    body: [
      "The effect written in the “Arrival Effect:” part of a card.",
      "As a rule, on arrival the owner of that piece must gain the effect written after “◆” and then adds that card to their hand.",
      "If the card itself says what happens to it, follow that instead of adding it to your hand.",
    ],
  },
  { term: "Adjacent", body: ["The 4 squares in front of, behind, left of and right of the target square."] },
  { term: "Draw", body: ["Adding a card from the deck to your hand."] },
  { term: "Empty square", body: ["A square with neither a card nor a piece on it."] },
  { term: "Field", body: ["The 7×7 grid of 49 squares in the middle of the board."] },
  { term: "Center of the field", body: ["The single square at the center of the 7×7 grid."] },
  {
    term: "First card",
    body: [
      "The card matching your piece's color that you receive before the game starts.",
      "In the 0th EDITION you begin the game with your First card already locked. You can use its Hand Effect during your Hand phase even while it is locked.",
      "This card is never targeted by other cards' effects: it cannot be taken or discarded.",
    ],
  },
  { term: "Player", body: ["Anyone taking part in the game."] },
  { term: "All players", body: ["Every player, including you."] },
  { term: "Square", body: ["A place on the field where cards and pieces are put. Cards themselves are not part of a square."] },
  {
    term: "At random",
    body: [
      "Done randomly, with no intent or bias.",
      "For example, with “Discard 1 card at random from your hand”, you shuffle your hand and pick one card without looking at its face.",
      "As a rule, when neither “at random” nor any other way of choosing is written, the player chooses whichever card they like.",
    ],
  },
  { term: "Colorless card", body: ["In S:EVEN, white and black cards are treated as colorless.", "A colorless card cannot be named as a color."] },
  {
    term: "Deck",
    body: [
      "All the normal cards shuffled together and stacked face-down. Put it anywhere outside the board.",
      "When the deck runs out, turn the discard pile face-down as it is and use it as the new deck.",
    ],
  },
  { term: "Lock", body: ["Placing one card face-up in the matching color slot of your Lock Area.", "As a rule, only one card can be locked per color."] },
  {
    term: "Lock Area",
    body: [
      "The place where cards are locked.",
      "Each player has one Lock Area of their own; the seven slots from red to purple together are called the Lock Area.",
      "For example, the slot where you would lock your red card is called “your red Lock Area”.",
    ],
  },
];

export const FAQ_CATEGORIES_EN = [
  {
    category: "Locking",
    items: [
      {
        question: "Can I use the Hand Effect of a card I have locked?",
        answer: [
          "As a rule, no.",
          "Locked cards generally cannot be used, and locking a card generally grants no effect at that moment either.",
          "However, cards such as First cards and Eternal cards whose effect box says they can still be used while locked can have their Hand Effect used from the Lock Area.",
          "Such cards show a “usable while locked” icon under their Hand Effect icon.",
        ],
      },
      {
        question: "What exactly does “locking the most” mean?",
        answer: [
          "It means having the greatest number of cards locked.",
          "Note that S:EVEN distinguishes clearly between “locking” a card in the Lock Area and merely “placing” one there. Anything an effect describes as “placing” is not locked.",
        ],
      },
      {
        question: "Do two Prism Shards count as two locked cards?",
        answer: [
          "Yes, they do.",
          "If you lock two Prism Shards with the Prism Shard's Hand Effect, both count as locked.",
          "The basic rules allow only one card per color slot, but the Prism Shard may be locked this way by its own effect.",
          "For example, if an opponent takes one of your two locked Prism Shards with So Sorry!'s Hand Effect, the remaining Prism Shard stays locked.",
        ],
      },
      {
        question: "Can I lock a Prism Shard during the Hand phase?",
        answer: [
          "Yes, if you have two of them in hand.",
          "The Prism Shard's Hand Effect lets you lock two Prism Shards during the Hand phase.",
          "Other Hand Effects such as Counter Lock's can also lock a single Prism Shard.",
          "However, as its effect box states, a Prism Shard cannot be locked during the Lock phase.",
        ],
      },
      {
        question: "Does the Brand of Black Temptation count as being locked?",
        answer: ["No.", "As its effect box states, it is only “placed” in the Lock Area, so it is not locked."],
      },
      {
        question: "I have to lock an Eternal card in a slot that already holds a Brand of Black Temptation. What happens to the Brand?",
        answer: [
          "It is added to your hand.",
          "The Gate Invasion Bonus rules say “if there are already cards where the Eternal card is to be locked (including colorless cards that are not locked), add all of them to your hand (First cards are not added)”, so everything there — locked or merely placed — goes to your hand.",
        ],
      },
      {
        question: "A successful gate invasion gave me an Eternal card of the same color as my First card. What happens?",
        answer: [
          "Both the First card and the Eternal card end up locked.",
          "Normally, when cards are already locked where the Eternal card goes, you follow the Gate Invasion Bonus rules, add those cards to your hand, and then lock the Eternal card.",
          "First cards, however, are excluded by that same wording (“First cards are not added”), so the First card stays where it is and the Eternal card is locked as well.",
        ],
      },
    ],
  },
  {
    category: "Hand",
    items: [
      { question: "Is there a limit to my hand size?", answer: ["As a rule, no.", "You may hold as many cards as you like."] },
      {
        question: "May I play with my hand visible to my opponents?",
        answer: [
          "As a rule, no.",
          "You must show it when a card's effect says to “show” your hand.",
          "When an effect says “at random”, hold your hand so the faces cannot be seen and let your opponent choose from it.",
        ],
      },
      {
        question: "Is there a limit to how many cards I can use in the Hand phase?",
        answer: ["As a rule, no.", "Cards newly added to your hand by an effect can also be used in the same turn's Hand phase."],
      },
      {
        question: "What happens to the card itself when I use its Hand Effect?",
        answer: [
          "You discard that card first, and then gain the Hand Effect.",
          "For example, say you hold 2 cards and use the Slum-Born Official. You discard the Slum-Born Official first, so you have 1 card in hand when the effect resolves — and that is the hand its effect looks at.",
        ],
      },
    ],
  },
  {
    category: "Moving",
    items: [
      {
        question: "Do I have to “move to an adjacent square” during the Move phase?",
        answer: [
          "As a rule you must either “move to an adjacent square” or “contact an adjacent opponent”.",
          "If you can do neither, place one card face-down from the deck onto any one square adjacent to your piece and end your turn.",
        ],
      },
      {
        question: "What if a card effect says “move 1 square” but I cannot move?",
        answer: [
          "The effect simply fizzles. If it was an Arrival Effect, you add that card to your hand as usual.",
          "If instead the effect is “take one extra Move phase” and you cannot move, place one card face-down from the deck onto any one square adjacent to your piece and end your turn.",
        ],
      },
      {
        question: "I resolved card A's Arrival Effect and added A to my hand, and a face-up card B was underneath it…",
        answer: [
          "You gain card B's Arrival Effect as well.",
          "The sequence is: ① resolve A's Arrival Effect → ② add A to your hand → ③ your piece arrives on B → ④ resolve B's Arrival Effect → ⑤ add B to your hand.",
          "(Fans affectionately call this an “arrival combo”.)",
        ],
      },
      {
        question: "When Space Swap swaps two pieces, do we gain the Arrival Effects where we land?",
        answer: [
          "A swap is not a “move”, so a face-down card at the destination is not revealed.",
          "However, if there is already a face-up card at the destination, its Arrival Effect does trigger (for both the user and the opponent, each at their own destination).",
          "When used as an Arrival Effect, the square the opponent is swapped onto — Space Swap itself — does not trigger again. If Space Swap is added to your hand after being resolved and a face-up card is exposed underneath, that card triggers as the opponent's Arrival Effect (the same idea as an arrival combo).",
          "When used as a Hand Effect it works the same way: a face-up card at the destination triggers its Arrival Effect.",
          "Because the swap is simultaneous, if both destinations have face-up cards both trigger, resolved in the order given by the resolution order principle (from the user, clockwise).",
        ],
      },
    ],
  },
  {
    category: "Contact",
    items: [
      {
        question: "Do I move when I make contact?",
        answer: ["No.", "As the basic rules say, the player making contact does not move; the player being contacted is force-moved to their gate."],
      },
      {
        question: "What happens if the opponent I contact has no cards in hand?",
        answer: [
          "Normally you add one random card from their hand to your own, but that is impossible if they hold nothing.",
          "The contacted player is simply force-moved to their own gate and the contact ends there.",
        ],
      },
      {
        question: "Can I make contact with the “move 1 square” of So Sorry!'s Arrival Effect?",
        answer: [
          "No.",
          "“Contact” and “move” are clearly different actions.",
          "If the effect were “take one extra Move phase” instead of “move 1 square”, contact would be possible.",
        ],
      },
      {
        question: "When I am contacted and force-moved to my gate, is the card there revealed?",
        answer: [
          "Yes.",
          "As the basic rules say, the contacted player is “force-moved” to their own gate.",
          "A “forced move” is “a move that may also go to a square with no card”, and a move always comes with revealing the card.",
        ],
      },
      {
        question: "Can I make contact even if there is no card on the opponent's square?",
        answer: ["Yes.", "The contacting player does not move, so whether that square holds a card is irrelevant. Besides, in S:EVEN only one piece may ever stand on a square."],
      },
    ],
  },
  {
    category: "Other",
    items: [
      {
        question: "How exactly do the phases work?",
        answer: [
          "There are three big phases: the Lock phase, the Hand phase and the Move phase.",
          "Within them there are player “declarations” (such as “I lock this”) and then the “resolution” of card effects and the like.",
          "So it goes like this:",
          "Lock phase → “lock declaration” → “lock resolution” / Hand phase → “hand-use declaration” → “Hand Effect resolution” / Move phase → “move declaration” → “move resolution” → “Arrival Effect resolution” / end of turn",
        ],
      },
      {
        question: "A card says it is “usable anytime” — are there moments when I still cannot use it?",
        answer: [
          "Yes.",
          "It cannot be used while anything — a card effect and so on — is being resolved. The Gate Invasion Bonus also counts as “being resolved”.",
        ],
      },
      {
        question: "In what order do I resolve an effect that targets several players?",
        answer: ["As a rule, start from the player who activated the effect (or the turn player if there is none) and continue clockwise (the resolution order principle)."],
      },
      {
        question: "With an effect that “places a card on any square”, may I place it on a square that holds a piece?",
        answer: ["Yes.", "Unless the effect says “a square without a player” or “an empty square” or similar, you may place it there."],
      },
      {
        question: "Can several pieces stand on one square?",
        answer: ["As a rule, no.", "Only one piece may be on a square."],
      },
    ],
  },
];
