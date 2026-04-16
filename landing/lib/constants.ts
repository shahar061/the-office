export const TYPEWRITER_PHRASES = [
  "your next big idea",
  "a recipe sharing app",
  "an AI-powered dashboard",
  "a multiplayer game",
  "your portfolio website",
  "a SaaS for freelancers",
];

export interface Agent {
  name: string;
  color: string;
  role: string;
}

export interface AgentGroup {
  label: string;
  agents: Agent[];
}

export const AGENTS: AgentGroup[] = [
  {
    label: "leadership",
    agents: [
      { name: "CEO", color: "#3b82f6", role: "Shapes your vision and leads discovery" },
      { name: "Product Manager", color: "#14b8a6", role: "Writes the PRD from your vision" },
      { name: "Market Researcher", color: "#22c55e", role: "Validates your idea against the market" },
      { name: "Chief Architect", color: "#f97316", role: "Designs the technical system" },
      { name: "UI/UX Expert", color: "#f43f5e", role: "Creates interface designs and mockups" },
    ],
  },
  {
    label: "coordination",
    agents: [
      { name: "Agent Organizer", color: "#a855f7", role: "Orchestrates the workflow between agents" },
      { name: "Project Manager", color: "#0ea5e9", role: "Creates the implementation plan" },
      { name: "Team Lead", color: "#f59e0b", role: "Breaks plans into tasks with TDD specs" },
    ],
  },
  {
    label: "engineering",
    agents: [
      { name: "Backend", color: "#10b981", role: "Builds APIs and server-side logic" },
      { name: "Frontend", color: "#6366f1", role: "Creates UI components and interactions" },
      { name: "Mobile", color: "#8b5cf6", role: "Cross-platform mobile development" },
      { name: "Data", color: "#06b6d4", role: "Manages data pipelines and analytics" },
      { name: "DevOps", color: "#ef4444", role: "Infrastructure and deployment" },
      { name: "Automation", color: "#ec4899", role: "Testing and CI/CD pipelines" },
      { name: "Freelancer", color: "#9ca3af", role: "Flexible specialist for any task" },
    ],
  },
];

export interface Phase {
  name: string;
  label: string;
  color: string;
  title: string;
  description: string;
  artifacts: string;
}

export const PHASES: Phase[] = [
  {
    name: "Imagine",
    label: "PHASE 1",
    color: "#3b82f6",
    title: "Discovery & Design",
    description:
      "Your AI team explores the problem space, validates ideas, and creates a comprehensive design.",
    artifacts: "Vision Brief \u00b7 PRD \u00b7 Market Analysis \u00b7 System Design",
  },
  {
    name: "War Room",
    label: "PHASE 2",
    color: "#f59e0b",
    title: "Planning & Architecture",
    description:
      "The team breaks down the design into an actionable plan with clear tasks and specifications.",
    artifacts: "Implementation Plan \u00b7 Task Breakdown \u00b7 TDD Specs",
  },
  {
    name: "Build",
    label: "PHASE 3",
    color: "#22c55e",
    title: "Implementation",
    description:
      "Engineers execute the plan, writing code with tests and reviews at every step.",
    artifacts: "Working Code \u00b7 Tests \u00b7 Code Review",
  },
];

export interface Feature {
  label: string;
  labelColor: string;
  title: string;
  description: string;
  screenshotHint: string;
}

export const FEATURES: Feature[] = [
  {
    label: "Live Visualization",
    labelColor: "#3b82f6",
    title: "Every tool call becomes a character action",
    description:
      "Watch your AI agents move through the office in real-time as they write code, review PRs, and discuss architecture.",
    screenshotHint: "office-visualization",
  },
  {
    label: "Project Management",
    labelColor: "#f59e0b",
    title: "Kanban, code review, and cost tracking",
    description:
      "Built-in project dashboard with task boards, code diffs, and token usage tracking across all agents.",
    screenshotHint: "project-management",
  },
  {
    label: "Artifacts",
    labelColor: "#22c55e",
    title: "Every decision, documented",
    description:
      "PRDs, system designs, implementation plans, and test specs are all saved as reviewable artifacts.",
    screenshotHint: "artifacts",
  },
  {
    label: "Integrations",
    labelColor: "#6366f1",
    title: "Works with the tools you already use",
    description:
      "Connect to GitHub, Linear, Figma, and more. Your AI office fits into your existing workflow.",
    screenshotHint: "integrations",
  },
];

export interface ProblemCard {
  emoji: string;
  title: string;
  description: string;
}

export const PROBLEM_CARDS: ProblemCard[] = [
  {
    emoji: "\ud83e\udd37",
    title: "I'm not technical",
    description:
      "You don't need to be. Describe your idea in plain English and let the AI team handle the rest.",
  },
  {
    emoji: "\ud83d\ude29",
    title: "I'm building alone",
    description:
      "Solo founders get a full team: PM, architect, frontend, backend, QA, and DevOps.",
  },
  {
    emoji: "\ud83d\udd73\ufe0f",
    title: "AI feels like a black box",
    description:
      "Watch every decision happen in real-time. See the reasoning, the code, the reviews.",
  },
  {
    emoji: "\ud83c\udf00",
    title: "Sessions spiral into chaos",
    description:
      "Structured phases keep work focused: discover, plan, then build. No more prompt soup.",
  },
];
