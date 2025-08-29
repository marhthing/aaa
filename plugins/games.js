const { bot, random } = require('../lib/')

// Simple number guessing game
bot(
  {
    pattern: 'guess ?(.*)',
    desc: 'Number guessing game',
    type: 'game',
  },
  async (message, match) => {
    if (!match) {
      return await message.send(`🎲 *Number Guessing Game*

I'm thinking of a number between 1 and 100!
Use: .guess <number> to make a guess

Example: .guess 50`)
    }
    
    const guess = parseInt(match)
    if (isNaN(guess) || guess < 1 || guess > 100) {
      return await message.send('❌ Please enter a number between 1 and 100')
    }
    
    // Generate target number (in real implementation, store per chat)
    const target = random(1, 100)
    
    if (guess === target) {
      await message.send(`🎉 *Congratulations!* 

You guessed it right! The number was *${target}*
🏆 You won in 1 try!`)
    } else if (guess < target) {
      await message.send(`📈 Too low! The number is higher than ${guess}`)
    } else {
      await message.send(`📉 Too high! The number is lower than ${guess}`)
    }
  }
)

// Rock Paper Scissors
bot(
  {
    pattern: 'rps ?(.*)',
    desc: 'Rock Paper Scissors game',
    type: 'game',
  },
  async (message, match) => {
    if (!match) {
      return await message.send(`✂️ *Rock Paper Scissors*

Choose your move:
🗿 rock
📄 paper  
✂️ scissors

Example: .rps rock`)
    }
    
    const userChoice = match.toLowerCase().trim()
    const validChoices = ['rock', 'paper', 'scissors']
    
    if (!validChoices.includes(userChoice)) {
      return await message.send('❌ Invalid choice! Use: rock, paper, or scissors')
    }
    
    const botChoice = validChoices[random(0, 2)]
    
    const emojis = {
      rock: '🗿',
      paper: '📄',
      scissors: '✂️'
    }
    
    let result = ''
    
    if (userChoice === botChoice) {
      result = '🤝 It\'s a tie!'
    } else if (
      (userChoice === 'rock' && botChoice === 'scissors') ||
      (userChoice === 'paper' && botChoice === 'rock') ||
      (userChoice === 'scissors' && botChoice === 'paper')
    ) {
      result = '🎉 You win!'
    } else {
      result = '🤖 I win!'
    }
    
    await message.send(`✂️ *Rock Paper Scissors*

You: ${emojis[userChoice]} ${userChoice}
Me: ${emojis[botChoice]} ${botChoice}

${result}`)
  }
)

// Dice roll
bot(
  {
    pattern: 'dice ?(.*)',
    desc: 'Roll a dice',
    type: 'game',
  },
  async (message, match) => {
    const sides = parseInt(match) || 6
    
    if (sides < 2 || sides > 100) {
      return await message.send('❌ Dice must have between 2 and 100 sides')
    }
    
    const result = random(1, sides)
    
    const diceEmojis = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅']
    const emoji = sides === 6 ? diceEmojis[result - 1] : '🎲'
    
    await message.send(`🎲 *Dice Roll*

${emoji} You rolled: *${result}*
(${sides}-sided dice)`)
  }
)

// Coin flip
bot(
  {
    pattern: 'flip ?(.*)',
    desc: 'Flip a coin',
    type: 'game',
  },
  async (message, match) => {
    const result = random(0, 1) === 0 ? 'heads' : 'tails'
    const emoji = result === 'heads' ? '🪙' : '🥇'
    
    await message.send(`🪙 *Coin Flip*

${emoji} Result: *${result.toUpperCase()}*`)
  }
)