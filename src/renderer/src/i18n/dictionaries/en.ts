export const en = {
  // App chrome
  'app.menu.settings': 'Settings',
  'app.menu.about': 'About',

  // Project picker
  'project.picker.openProject': 'Open Project',
  'project.picker.recentProjects': 'Recent Projects',
  'project.picker.browseFolder': 'Browse for Project Folder…',
  'project.picker.opening': 'Opening...',
  'project.picker.creating': 'Creating...',
  'project.picker.loadingRecent': 'Loading recent projects...',
  'project.picker.createProject': 'Create Project',
  'project.picker.empty': 'No recent projects',
  'project.picker.connect': 'Connect',
  'project.picker.notConnected': 'Not connected',
  'project.picker.connected': 'Connected',

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
  'iconrail.devjump': 'Dev Jump',
  'iconrail.feedback': 'Report a bug',

  // Bug report / feedback modal
  'feedback.title': 'Report a Bug / Request a Feature',
  'feedback.type.bug': '🐛 Bug',
  'feedback.type.feature': '✨ Feature request',
  'feedback.title.placeholder': 'Title (one line)',
  'feedback.body.placeholder': 'Describe the bug, steps to reproduce, expected vs actual...',
  'feedback.attached.summary': 'Auto-attached info (will be sent)',
  'feedback.cancel': 'Cancel',
  'feedback.submit': 'Submit',
  'feedback.submitting': 'Submitting...',
  'feedback.success': '✓ Report submitted (#{id}). Thanks!',
  'feedback.success.close': 'Close',
  'feedback.success.another': 'Submit another',
  'feedback.error.network': 'No connection to feedback service. Check your network and try again.',
  'feedback.error.turnstile': 'Captcha verification failed. Please complete the captcha and try again.',
  'feedback.error.rate': 'Too many submissions. Try again in a minute.',
  'feedback.error.invalid': 'Submission rejected: {message}',
  'feedback.error.server': 'Something broke on our end. Try again later — your submission was not saved.',

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

  // About — dev mode tap-to-unlock
  'about.devmode.almost': 'Press {count} more times to enable dev mode',
  'about.devmode.enabled': '✓ Dev mode enabled',
  'about.devmode.on': 'Dev mode is on.',
  'about.devmode.disable': 'Disable',
  'about.devmode.forced': 'Dev mode forced on by OFFICE_DEV environment variable.',

  // Settings
  'settings.title': 'Settings',
  'settings.language.title': 'Language',
  'settings.language.english': 'English',
  'settings.language.hebrew': 'עברית',
  'settings.language.note': 'Changes take effect immediately.',
  'settings.workspace.placeholder': 'Open a project to manage workspace settings.',

  // App chrome cluster
  'cluster.language.aria': 'Switch language',
  'cluster.auth.disconnected.aria': 'Connect API key',

  // Intro sequences
  'intro.ceo.step1': 'Ah, a new project! *adjusts glasses*\nWelcome to The Office. I\'m the CEO — and we\'ve got quite the team here.',
  'intro.ceo.step2': 'First, we Imagine — that\'s where I sit down with the leadership team and figure out exactly what we\'re building.',
  'intro.ceo.step3': 'Then the War Room turns it into a battle plan, and the engineers Build it. The whole team\'s had their coffee already.',
  'intro.ceo.step4': 'Over there is where we chat. You can talk to the team, answer their questions, and guide the project as it moves along.',
  'intro.ceo.step5': 'So, what would you like to build?',
  'intro.warroom.step1': "Time to turn vision into action. I'm the Project Manager — I'll be leading the War Room phase.",
  'intro.warroom.step2': "I'll review everything the leadership team created and write a battle plan. You'll get to review it before we move on.",
  'intro.warroom.step3': "Then the Team Lead will break it into tasks for the engineers. Let's get started.",

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
