export const en = {
  // App chrome
  'app.menu.settings': 'Settings',
  'app.menu.about': 'About',

  // Project picker
  'project.picker.title': 'Open a project',
  'project.picker.create': 'Create new project',
  'project.picker.recent': 'Recent projects',
  'project.picker.empty': 'No recent projects yet.',
  'project.picker.open': 'Open',

  // IconRail
  'iconrail.chat': 'Chat',
  'iconrail.office': 'Office',
  'iconrail.agents': 'Agents',
  'iconrail.kanban': 'Kanban',
  'iconrail.stats': 'Stats',
  'iconrail.complete': 'Complete',
  'iconrail.workshop': 'Workshop',
  'iconrail.diff': 'Diff',
  'iconrail.logs': 'Logs',
  'iconrail.about': 'About',
  'iconrail.settings': 'Settings',

  // Phase tabs
  'phase.imagine': 'Imagine',
  'phase.warroom': 'War Room',
  'phase.build': 'Build',
  'phase.complete': 'Complete',
  'phase.idle': 'Idle',

  // Chat panel
  'chat.empty.title': 'The Office',
  'chat.empty.idle': 'Describe what you want to build and the team will get to work.',
  'chat.empty.active': 'No messages yet.',
  'chat.input.placeholder': 'Type a message...',
  'chat.input.placeholder.idle': 'What would you like to build?',
  'chat.input.placeholder.responding': 'Responding to {agent}...',
  'chat.input.send.aria': 'Send message',
  'chat.archived.run': 'Run {number} — {agent}',
  'chat.archived.messageCount': '({count} messages, {date})',
  'chat.archived.messageCount.one': '({count} message, {date})',
  'chat.activity.thinking': 'Thinking...',
  'chat.history.viewing': 'Viewing {phase} history — read-only.',
  'chat.history.return': 'Return to {phase}',
  'chat.current': 'Current',

  // Question bubble
  'question.recommended': 'Recommended',
  'question.tradeoffs': 'Trade-offs',

  // Permission prompt
  'permission.title': 'Permission requested',
  'permission.allow': 'Allow',
  'permission.deny': 'Deny',
  'permission.deny.reason.placeholder': 'Optional reason for the agent...',

  // Settings
  'settings.title': 'Settings',
  'settings.language.title': 'Language',
  'settings.language.english': 'English',
  'settings.language.hebrew': 'עברית',
  'settings.language.note': 'Changes take effect immediately.',

  // Office overlays
  'overlay.uidesign.title': 'UI Designs — Review',
  'overlay.uidesign.approve': 'Approve',
  'overlay.uidesign.feedback.placeholder': 'Tell the designer what to change...',
  'overlay.uidesign.feedback.send': 'Request changes',
  'overlay.plan.title': 'Plan — Review',
  'overlay.plan.approve': 'Approve',
  'overlay.plan.feedback.placeholder': 'What should change?',
  'overlay.plan.feedback.send': 'Request changes',
  'overlay.requestplan.title': 'Workshop request — Plan ready',
  'overlay.requestplan.approve': 'Approve',
  'overlay.artifact.close': 'Close',
  'overlay.greenfield.recovery': 'Recovery point created.',

  // Build
  'build.intro.title': 'Ready to build',
  'build.intro.start': 'Start build',
  'build.intro.cancel': 'Not yet',
  'kanban.column.queued': 'Queued',
  'kanban.column.active': 'Active',
  'kanban.column.review': 'Review',
  'kanban.column.done': 'Done',
  'kanban.column.failed': 'Failed',

  // Completion
  'completion.title': 'Project complete',
  'completion.openFolder': 'Open project folder',
  'completion.runMd': 'View run summary',

  // World chrome
  'world.toolbubble.reading': 'Reading',
  'world.toolbubble.writing': 'Writing',

  // Agent role display names
  'agent.ceo': 'CEO',
  'agent.product-manager': 'Product Manager',
  'agent.market-researcher': 'Market Researcher',
  'agent.chief-architect': 'Chief Architect',
  'agent.agent-organizer': 'Agent Organizer',
  'agent.project-manager': 'Project Manager',
  'agent.team-lead': 'Team Lead',
  'agent.backend-engineer': 'Backend Engineer',
  'agent.frontend-engineer': 'Frontend Engineer',
  'agent.mobile-developer': 'Mobile Developer',
  'agent.ui-ux-expert': 'UI/UX Expert',
  'agent.data-engineer': 'Data Engineer',
  'agent.devops': 'DevOps',
  'agent.automation-developer': 'Automation Developer',
  'agent.freelancer': 'Freelancer',
} as const;

export type StringKey = keyof typeof en;
