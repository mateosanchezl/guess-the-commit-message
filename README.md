# 🎯 Guess the Commit

A fun team game where you guess who wrote each commit message from your GitHub organization!

## 🚀 Quick Start

1. **Install dependencies:**

   ```bash
   npm install
   ```

2. **Start the development server:**

   ```bash
   npm run dev
   ```

3. **Open your browser** and navigate to the local development URL (usually `http://localhost:5173`)

## 🔑 GitHub Token Setup

To play the game, you'll need a GitHub Personal Access Token with the following permissions:

1. Go to [GitHub Settings > Personal Access Tokens](https://github.com/settings/tokens)
2. Click "Generate new token (classic)"
3. Give it a descriptive name like "Guess the Commit Game"
4. Select these scopes:
   - ✅ `read:org` - Read organization membership
   - ✅ `repo` - Full control of private repositories
5. Click "Generate token"
6. **Copy the token immediately** (you won't be able to see it again!)

## 🎮 How to Play

1. **Connect**: Enter your GitHub token in the app
2. **Select Organization**: Choose which organization to play with
3. **Choose Repositories**: Select which repositories to include in the game
4. **Guess**: Read each commit message and guess who wrote it
5. **Score**: Track your accuracy and streak!

## 🛡️ Security & Privacy

- **No data storage**: Your token is only stored in your browser session
- **Local only**: Everything runs in your browser - no backend required
- **Minimal permissions**: Only reads organization data and commit messages
- **Session-based**: Token is cleared when you close the browser

## 🎨 Features

- ✨ Beautiful, modern UI with smooth animations
- 📱 Fully responsive design (works on desktop and tablet)
- 🎯 Real-time scoring with streak tracking
- 🔄 Automatic commit loading for continuous gameplay
- ⚡ Fast GitHub API integration with error handling
- 🌿 Fetches commits from all branches (not just main)
- 👥 Searches for commits by each team member individually
- 🎭 Visual feedback for correct/incorrect guesses
- ⚖️ Balanced commit distribution across all team members
- 📊 Visual commit distribution indicator
- 🗂️ Repository selection - choose which repos to include
- ✅ Multi-select interface with select all/deselect all options

## 🏗️ Technical Details

- **Frontend**: React 19 + TypeScript + Vite
- **Styling**: Pure CSS with modern animations
- **API**: GitHub REST API v3
- **No external dependencies**: Lightweight and self-contained

## 🐛 Troubleshooting

**"No organizations found"**

- Make sure you're a member of at least one GitHub organization
- Verify your token has `read:org` permission

**"No commits found"**

- Ensure the organization has repositories with commits
- Check that organization members have made commits recently
- Make sure you've selected at least one repository

**"Rate limit exceeded"**

- GitHub has API rate limits. Wait a few minutes and try again
- Consider using a token with higher rate limits

**"Invalid token"**

- Double-check your token is correct
- Make sure the token hasn't expired
- Verify it has the required permissions

## 🎉 Team Fun

This game is perfect for:

- Team building activities
- Learning about your teammates' coding styles
- Fun breaks during sprints
- Onboarding new team members

Enjoy guessing those commits! 🚀
