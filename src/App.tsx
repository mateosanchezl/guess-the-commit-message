import { useState, useCallback } from "react";
import "./App.css";

// TypeScript interfaces for GitHub API responses
interface GitHubUser {
  id: number;
  login: string;
  avatar_url: string;
  html_url: string;
}

interface GitHubOrg {
  id: number;
  login: string;
  description: string;
}

interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
}

interface GitHubCommit {
  sha: string;
  commit: {
    message: string;
    author: {
      name: string;
      email: string;
      date: string;
    };
  };
  author: GitHubUser;
  html_url: string;
}

interface GameState {
  token: string;
  currentOrg: GitHubOrg | null;
  members: GitHubUser[];
  availableRepos: GitHubRepo[];
  selectedRepos: GitHubRepo[];
  commits: GitHubCommit[];
  currentCommit: GitHubCommit | null;
  score: { correct: number; total: number; streak: number };
  gamePhase: "setup" | "loading" | "repo-selection" | "game" | "feedback";
  error: string | null;
  selectedMember: GitHubUser | null;
  correctAnswer: GitHubUser | null;
  commitDistribution: Map<string, number>;
}

// GitHub API service
class GitHubService {
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  private async fetchWithAuth(url: string): Promise<unknown> {
    const response = await fetch(url, {
      headers: {
        Authorization: `token ${this.token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "GuessTheCommit/1.0",
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("Invalid GitHub token. Please check your token and try again.");
      }
      if (response.status === 403) {
        throw new Error("Rate limit exceeded. Please wait a moment and try again.");
      }
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  async getUserOrgs(): Promise<GitHubOrg[]> {
    const orgs = (await this.fetchWithAuth("https://api.github.com/user/orgs")) as GitHubOrg[];
    return orgs;
  }

  async getOrgMembers(orgLogin: string): Promise<GitHubUser[]> {
    const members = (await this.fetchWithAuth(
      `https://api.github.com/orgs/${orgLogin}/members`
    )) as GitHubUser[];
    return members;
  }

  async getOrgRepos(orgLogin: string): Promise<GitHubRepo[]> {
    const repos = (await this.fetchWithAuth(
      `https://api.github.com/orgs/${orgLogin}/repos?per_page=100`
    )) as GitHubRepo[];
    return repos;
  }

  async getRepoBranches(repoFullName: string): Promise<string[]> {
    try {
      const branches = (await this.fetchWithAuth(
        `https://api.github.com/repos/${repoFullName}/branches?per_page=100`
      )) as Array<{ name: string }>;
      return branches.map((branch) => branch.name);
    } catch (error) {
      console.warn(`Failed to fetch branches for ${repoFullName}:`, error);
      return ["main", "master"]; // Fallback to common branch names
    }
  }

  async getRepoCommitsByAuthor(
    repoFullName: string,
    authorLogin: string,
    perPage: number = 10
  ): Promise<GitHubCommit[]> {
    try {
      // First get all branches
      const branches = await this.getRepoBranches(repoFullName);

      // Fetch commits from all branches for this specific author
      const branchCommitPromises = branches.map((branch) =>
        this.fetchWithAuth(
          `https://api.github.com/repos/${repoFullName}/commits?sha=${branch}&author=${authorLogin}&per_page=${Math.ceil(
            perPage / branches.length
          )}`
        ).catch((error) => {
          console.warn(
            `Failed to fetch commits from branch ${branch} for author ${authorLogin} in ${repoFullName}:`,
            error
          );
          return [];
        })
      );

      const allBranchCommits = await Promise.all(branchCommitPromises);
      const allCommits = allBranchCommits.flat() as GitHubCommit[];

      // Remove duplicates based on commit SHA
      const uniqueCommits = new Map<string, GitHubCommit>();
      allCommits.forEach((commit) => {
        if (!uniqueCommits.has(commit.sha)) {
          uniqueCommits.set(commit.sha, commit);
        }
      });

      const filteredCommits = Array.from(uniqueCommits.values()).filter(
        (commit: GitHubCommit) =>
          commit.commit.message &&
          commit.commit.message.trim() !== "" &&
          !commit.commit.message.startsWith("Merge") &&
          commit.author &&
          commit.author.login === authorLogin
      );

      console.log(
        `Found ${filteredCommits.length} commits from ${authorLogin} across ${branches.length} branches in ${repoFullName}`
      );
      return filteredCommits;
    } catch (error) {
      console.warn(`Failed to fetch commits for ${authorLogin} in ${repoFullName}:`, error);
      return [];
    }
  }

  async getRepoCommits(repoFullName: string, perPage: number = 30): Promise<GitHubCommit[]> {
    try {
      // First get all branches
      const branches = await this.getRepoBranches(repoFullName);
      console.log(
        `Fetching commits from ${branches.length} branches in ${repoFullName}:`,
        branches
      );

      // Fetch commits from all branches in parallel
      const branchCommitPromises = branches.map((branch) =>
        this.fetchWithAuth(
          `https://api.github.com/repos/${repoFullName}/commits?sha=${branch}&per_page=${Math.ceil(
            perPage / branches.length
          )}`
        ).catch((error) => {
          console.warn(`Failed to fetch commits from branch ${branch} in ${repoFullName}:`, error);
          return [];
        })
      );

      const allBranchCommits = await Promise.all(branchCommitPromises);
      const allCommits = allBranchCommits.flat() as GitHubCommit[];

      // Remove duplicates based on commit SHA
      const uniqueCommits = new Map<string, GitHubCommit>();
      allCommits.forEach((commit) => {
        if (!uniqueCommits.has(commit.sha)) {
          uniqueCommits.set(commit.sha, commit);
        }
      });

      const filteredCommits = Array.from(uniqueCommits.values()).filter(
        (commit: GitHubCommit) =>
          commit.commit.message &&
          commit.commit.message.trim() !== "" &&
          !commit.commit.message.startsWith("Merge") &&
          commit.author
      );

      console.log(
        `Found ${filteredCommits.length} unique commits from ${branches.length} branches in ${repoFullName}`
      );
      return filteredCommits;
    } catch (error) {
      console.warn(`Failed to fetch commits for ${repoFullName}:`, error);
      return [];
    }
  }
}

function App() {
  const [gameState, setGameState] = useState<GameState>({
    token: "",
    currentOrg: null,
    members: [],
    availableRepos: [],
    selectedRepos: [],
    commits: [],
    currentCommit: null,
    score: { correct: 0, total: 0, streak: 0 },
    gamePhase: "setup",
    error: null,
    selectedMember: null,
    correctAnswer: null,
    commitDistribution: new Map(),
  });

  const [tokenInput, setTokenInput] = useState("");
  const [availableOrgs, setAvailableOrgs] = useState<GitHubOrg[]>([]);

  // Load commits from selected repositories, ensuring each member is represented
  const loadCommits = useCallback(
    async (selectedRepos: GitHubRepo[], members: GitHubUser[]) => {
      try {
        const githubService = new GitHubService(gameState.token);
        const commitsByAuthor = new Map<string, GitHubCommit[]>();

        console.log(
          `Fetching commits for ${members.length} members across ${selectedRepos.length} repositories...`
        );

        // For each member, fetch commits from all selected repositories
        for (const member of members) {
          const memberCommits: GitHubCommit[] = [];

          // Fetch commits from each repository for this member
          for (const repo of selectedRepos) {
            try {
              const repoCommits = await githubService.getRepoCommitsByAuthor(
                repo.full_name,
                member.login,
                15
              );
              memberCommits.push(...repoCommits);
            } catch (error) {
              console.warn(
                `Failed to fetch commits for ${member.login} from ${repo.full_name}:`,
                error
              );
            }
          }

          // Remove duplicates for this member
          const uniqueMemberCommits = new Map<string, GitHubCommit>();
          memberCommits.forEach((commit) => {
            if (!uniqueMemberCommits.has(commit.sha)) {
              uniqueMemberCommits.set(commit.sha, commit);
            }
          });

          const finalMemberCommits = Array.from(uniqueMemberCommits.values());
          commitsByAuthor.set(member.login, finalMemberCommits);

          console.log(`Found ${finalMemberCommits.length} commits for ${member.login}`);
        }

        // Check if we have commits from at least 2 members
        const authorsWithCommits = Array.from(commitsByAuthor.entries()).filter(
          ([, commits]) => commits.length > 0
        );

        if (authorsWithCommits.length < 2) {
          throw new Error(
            `Only found commits from ${authorsWithCommits.length} member(s). Need commits from at least 2 different members to play the game.`
          );
        }

        // Create a balanced distribution of commits using round-robin
        const balancedCommits: GitHubCommit[] = [];
        const targetCommitsPerAuthor = Math.max(5, Math.floor(50 / authorsWithCommits.length)); // Aim for at least 5 commits per author

        // Create a round-robin distribution to ensure everyone gets equal representation
        const authorCommitArrays = authorsWithCommits.map(([author, commits]) => ({
          author,
          commits: commits.slice(0, targetCommitsPerAuthor), // Limit commits per author
          index: 0,
        }));

        // Round-robin through authors to ensure balanced distribution
        let roundRobinIndex = 0;
        let totalAdded = 0;
        const maxTotalCommits = targetCommitsPerAuthor * authorsWithCommits.length;

        while (
          totalAdded < maxTotalCommits &&
          authorCommitArrays.some((a) => a.index < a.commits.length)
        ) {
          const currentAuthor = authorCommitArrays[roundRobinIndex];

          if (currentAuthor.index < currentAuthor.commits.length) {
            balancedCommits.push(currentAuthor.commits[currentAuthor.index]);
            currentAuthor.index++;
            totalAdded++;
          }

          roundRobinIndex = (roundRobinIndex + 1) % authorCommitArrays.length;
        }

        // Final shuffle for randomness
        const shuffledCommits = [...balancedCommits].sort(() => Math.random() - 0.5);

        // Calculate final distribution for display
        const finalDistribution = new Map<string, number>();
        shuffledCommits.forEach((commit) => {
          const author = commit.author.login;
          finalDistribution.set(author, (finalDistribution.get(author) || 0) + 1);
        });

        console.log("Final commit distribution by author:", Object.fromEntries(finalDistribution));
        console.log(
          `Total commits loaded: ${shuffledCommits.length} from ${authorsWithCommits.length} authors`
        );

        setGameState((prev) => ({
          ...prev,
          commits: shuffledCommits,
          currentCommit: shuffledCommits[0],
          gamePhase: "game",
          error: null,
          commitDistribution: finalDistribution,
        }));
      } catch (error) {
        setGameState((prev) => ({
          ...prev,
          error: error instanceof Error ? error.message : "Failed to load commits",
          gamePhase: "setup",
        }));
      }
    },
    [gameState.token]
  );

  // Connect to GitHub
  const connectToGitHub = async () => {
    if (!tokenInput.trim()) {
      setGameState((prev) => ({ ...prev, error: "Please enter a GitHub token" }));
      return;
    }

    setGameState((prev) => ({ ...prev, gamePhase: "loading", error: null }));

    try {
      const githubService = new GitHubService(tokenInput);
      const orgs = await githubService.getUserOrgs();

      if (orgs.length === 0) {
        throw new Error(
          "No organizations found. Make sure you are a member of at least one organization."
        );
      }

      setAvailableOrgs(orgs);
      setGameState((prev) => ({
        ...prev,
        token: tokenInput,
        gamePhase: "setup",
      }));
    } catch (error) {
      setGameState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : "Failed to connect to GitHub",
        gamePhase: "setup",
      }));
    }
  };

  // Select organization and load repositories
  const selectOrgAndLoadRepos = async (org: GitHubOrg) => {
    setGameState((prev) => ({ ...prev, gamePhase: "loading", error: null }));

    try {
      const githubService = new GitHubService(gameState.token);
      const [members, repos] = await Promise.all([
        githubService.getOrgMembers(org.login),
        githubService.getOrgRepos(org.login),
      ]);

      if (members.length < 2) {
        throw new Error("Organization must have at least 2 members to play the game.");
      }

      if (repos.length === 0) {
        throw new Error("No repositories found in this organization.");
      }

      setGameState((prev) => ({
        ...prev,
        currentOrg: org,
        members: members,
        availableRepos: repos,
        selectedRepos: repos, // Default to all repos selected
        gamePhase: "repo-selection",
      }));
    } catch (error) {
      setGameState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : "Failed to load organization data",
        gamePhase: "setup",
      }));
    }
  };

  // Start game with selected repositories
  const startGameWithSelectedRepos = async () => {
    if (gameState.selectedRepos.length === 0) {
      setGameState((prev) => ({
        ...prev,
        error: "Please select at least one repository to play the game.",
      }));
      return;
    }

    setGameState((prev) => ({ ...prev, gamePhase: "loading", error: null }));
    await loadCommits(gameState.selectedRepos, gameState.members);
  };

  // Handle member selection
  const selectMember = (member: GitHubUser) => {
    if (gameState.gamePhase !== "game" || !gameState.currentCommit) return;

    const isCorrect = member.login === gameState.currentCommit.author.login;
    const newScore = {
      correct: gameState.score.correct + (isCorrect ? 1 : 0),
      total: gameState.score.total + 1,
      streak: isCorrect ? gameState.score.streak + 1 : 0,
    };

    setGameState((prev) => ({
      ...prev,
      selectedMember: member,
      correctAnswer: prev.currentCommit?.author || null,
      score: newScore,
      gamePhase: "feedback",
    }));

    // Move to next commit after showing feedback
    setTimeout(() => {
      const remainingCommits = gameState.commits.slice(1);
      if (remainingCommits.length === 0) {
        // Reload more commits if we're running low
        if (gameState.selectedRepos.length > 0) {
          loadCommits(gameState.selectedRepos, gameState.members);
        }
      } else {
        setGameState((prev) => ({
          ...prev,
          commits: remainingCommits,
          currentCommit: remainingCommits[0],
          gamePhase: "game",
          selectedMember: null,
          correctAnswer: null,
        }));
      }
    }, 2000);
  };

  // Toggle repository selection
  const toggleRepoSelection = (repo: GitHubRepo) => {
    setGameState((prev) => {
      const isSelected = prev.selectedRepos.some((r) => r.id === repo.id);
      const newSelectedRepos = isSelected
        ? prev.selectedRepos.filter((r) => r.id !== repo.id)
        : [...prev.selectedRepos, repo];

      return {
        ...prev,
        selectedRepos: newSelectedRepos,
      };
    });
  };

  // Select all repositories
  const selectAllRepos = () => {
    setGameState((prev) => ({
      ...prev,
      selectedRepos: prev.availableRepos,
    }));
  };

  // Deselect all repositories
  const deselectAllRepos = () => {
    setGameState((prev) => ({
      ...prev,
      selectedRepos: [],
    }));
  };

  // Reset game
  const resetGame = () => {
    setGameState({
      token: "",
      currentOrg: null,
      members: [],
      availableRepos: [],
      selectedRepos: [],
      commits: [],
      currentCommit: null,
      score: { correct: 0, total: 0, streak: 0 },
      gamePhase: "setup",
      error: null,
      selectedMember: null,
      correctAnswer: null,
      commitDistribution: new Map(),
    });
    setTokenInput("");
    setAvailableOrgs([]);
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>🎯 Guess the Commit</h1>
        <p>Connect your GitHub account and guess who wrote each commit message!</p>
      </header>

      <main className="app-main">
        {gameState.gamePhase === "setup" && (
          <div className="setup-phase">
            {!gameState.token ? (
              <div className="token-setup">
                <h2>Connect to GitHub</h2>
                <p>Enter your GitHub personal access token to get started:</p>
                <div className="token-input-group">
                  <input
                    type="password"
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                    className="token-input"
                  />
                  <button
                    onClick={connectToGitHub}
                    className="connect-button"
                    disabled={!tokenInput.trim()}
                  >
                    Connect
                  </button>
                </div>
                <div className="token-help">
                  <p>
                    Need a token?{" "}
                    <a
                      href="https://github.com/settings/tokens"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Create one here
                    </a>
                  </p>
                  <p>
                    Required permissions: <code>read:org</code>, <code>repo</code>
                  </p>
                </div>
              </div>
            ) : (
              <div className="org-selection">
                <h2>Select Organization</h2>
                <p>Choose which organization to play with:</p>
                <div className="org-list">
                  {availableOrgs.map((org) => (
                    <button
                      key={org.id}
                      onClick={() => selectOrgAndLoadRepos(org)}
                      className="org-button"
                    >
                      <h3>{org.login}</h3>
                      {org.description && <p>{org.description}</p>}
                    </button>
                  ))}
                </div>
                <button onClick={resetGame} className="reset-button">
                  Use Different Token
                </button>
              </div>
            )}
          </div>
        )}

        {gameState.gamePhase === "loading" && (
          <div className="loading-phase">
            <div className="loading-spinner"></div>
            <h2>Loading game data...</h2>
            <p>
              {gameState.currentOrg
                ? "Fetching commits from all branches in selected repositories..."
                : "Fetching organization members and repositories..."}
            </p>
          </div>
        )}

        {gameState.gamePhase === "repo-selection" && (
          <div className="repo-selection-phase">
            <h2>Select Repositories</h2>
            <p>Choose which repositories to include in the game:</p>

            <div className="repo-selection-controls">
              <button onClick={selectAllRepos} className="select-all-button">
                Select All
              </button>
              <button onClick={deselectAllRepos} className="deselect-all-button">
                Deselect All
              </button>
              <span className="selection-count">
                {gameState.selectedRepos.length} of {gameState.availableRepos.length} selected
              </span>
            </div>

            <div className="repo-list">
              {gameState.availableRepos.map((repo) => {
                const isSelected = gameState.selectedRepos.some((r) => r.id === repo.id);
                return (
                  <div
                    key={repo.id}
                    className={`repo-item ${isSelected ? "selected" : ""}`}
                    onClick={() => toggleRepoSelection(repo)}
                  >
                    <div className="repo-checkbox">
                      {isSelected && <span className="checkmark">✓</span>}
                    </div>
                    <div className="repo-info">
                      <h3>{repo.name}</h3>
                      <p className="repo-full-name">{repo.full_name}</p>
                      {repo.private && <span className="private-badge">Private</span>}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="repo-selection-actions">
              <button onClick={startGameWithSelectedRepos} className="start-game-button">
                Start Game
              </button>
              <button onClick={resetGame} className="back-button">
                Back to Organizations
              </button>
            </div>
          </div>
        )}

        {gameState.gamePhase === "game" && gameState.currentCommit && (
          <div className="game-phase">
            <div className="score-display">
              <div className="score-item">
                <span className="score-label">Score:</span>
                <span className="score-value">
                  {gameState.score.correct}/{gameState.score.total}
                </span>
              </div>
              <div className="score-item">
                <span className="score-label">Streak:</span>
                <span className="score-value">{gameState.score.streak}</span>
              </div>
              <div className="score-item">
                <span className="score-label">Commits:</span>
                <span className="score-value">{gameState.commits.length}</span>
              </div>
            </div>

            {/* Commit distribution indicator */}
            <div className="distribution-indicator">
              <h4>Commit Distribution</h4>
              <div className="distribution-bars">
                {Array.from(gameState.commitDistribution.entries()).map(([author, count]) => {
                  const maxCount = Math.max(...Array.from(gameState.commitDistribution.values()));
                  const percentage = (count / maxCount) * 100;
                  const member = gameState.members.find((m) => m.login === author);

                  return (
                    <div key={author} className="distribution-bar">
                      <div className="bar-info">
                        <img src={member?.avatar_url} alt={author} className="bar-avatar" />
                        <span className="bar-author">{author}</span>
                        <span className="bar-count">{count}</span>
                      </div>
                      <div className="bar-track">
                        <div className="bar-fill" style={{ width: `${percentage}%` }}></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="commit-card">
              <h3>Commit Message</h3>
              <div className="commit-message">"{gameState.currentCommit.commit.message}"</div>
            </div>

            <div className="question-section">
              <h2>Who wrote this commit?</h2>
              <div className="members-grid">
                {gameState.members.map((member) => (
                  <button
                    key={member.id}
                    onClick={() => selectMember(member)}
                    className="member-button"
                  >
                    <img src={member.avatar_url} alt={member.login} className="member-avatar" />
                    <span className="member-name">{member.login}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {gameState.gamePhase === "feedback" &&
          gameState.selectedMember &&
          gameState.correctAnswer && (
            <div className="feedback-phase">
              <div
                className={`feedback-result ${
                  gameState.selectedMember.login === gameState.correctAnswer.login
                    ? "correct"
                    : "incorrect"
                }`}
              >
                {gameState.selectedMember.login === gameState.correctAnswer.login ? (
                  <>
                    <div className="feedback-icon">✅</div>
                    <h2>Correct!</h2>
                    <p>Great guess! {gameState.correctAnswer.login} wrote this commit.</p>
                  </>
                ) : (
                  <>
                    <div className="feedback-icon">❌</div>
                    <h2>Incorrect</h2>
                    <p>
                      The correct answer was <strong>{gameState.correctAnswer.login}</strong>.
                    </p>
                  </>
                )}
              </div>

              <div className="commit-details">
                <div className="commit-message">"{gameState.currentCommit?.commit.message}"</div>
                <div className="commit-author">
                  <img
                    src={gameState.correctAnswer.avatar_url}
                    alt={gameState.correctAnswer.login}
                    className="author-avatar"
                  />
                  <span>{gameState.correctAnswer.login}</span>
                </div>
              </div>
            </div>
          )}

        {gameState.error && (
          <div className="error-message">
            <h3>⚠️ Error</h3>
            <p>{gameState.error}</p>
            <button onClick={resetGame} className="retry-button">
              Try Again
            </button>
          </div>
        )}
      </main>

      <footer className="app-footer">
        <p>Built for team fun • No data is stored permanently</p>
      </footer>
    </div>
  );
}

export default App;
