// ============================================================
// The cookbook — ready-made playbooks for the jobs people hand an AI on a
// WordPress site.
//
// Extracted mechanically from the connector plugin, where it used to live as
// 572 lines shipped to every customer. Moving it here means a new or corrected
// recipe reaches every site the next day instead of whenever that site next
// updates its plugin — and the sites running a year-old build are exactly the
// ones whose owners most need a good playbook.
//
// The plugin now fetches this and caches it; see cb_cookbook_recipes().
// ============================================================

export const RECIPES = [
  {
    "id": "security-audit",
    "title": "Run a Security Audit and Fix What It Finds",
    "summary": "Review every custom theme and plugin file for the vulnerabilities that actually get sites hacked, then patch them one at a time.",
    "time": "20–40 min",
    "tags": [
      "Security",
      "Code review"
    ],
    "tools": [
      "list_wp_skills",
      "get_wp_skill",
      "list_plugins",
      "list_files",
      "read_file",
      "edit_file"
    ],
    "prompt": "Audit this WordPress site for security problems in the code we control.\n\n1. Load the bundled wp-security-review skill (list_wp_skills, then get_wp_skill) and follow it.\n2. Scope: the active theme plus these custom plugins: [plugin folder names, or \"every plugin not from wordpress.org\"]. Skip well-known third-party plugins.\n3. Look for missing capability checks, missing nonces on form/AJAX/REST handlers, unescaped output, unsanitized input, direct SQL without $wpdb->prepare, unrestricted file uploads, and anything using eval/unserialize on user input.\n4. Report findings first, ranked by how exploitable they are, with file:line and a one-line proof of how it would be abused. Do not change anything yet.\n5. Then fix them one file at a time, showing me the diff before each edit, starting with the worst.\n\nDo not touch wp-config.php or core files."
  },
  {
    "id": "white-screen",
    "title": "Track Down the Plugin Breaking a Page",
    "summary": "A page is white, fatal, or \"critical error\". Bisect the active plugins automatically and name the culprit.",
    "time": "5–15 min",
    "tags": [
      "Troubleshooting",
      "Plugins"
    ],
    "tools": [
      "conflict_scan",
      "render_page",
      "site_info",
      "read_file"
    ],
    "prompt": "This page is broken: [full URL of the broken page]. It shows [white screen / \"There has been a critical error\" / wrong layout].\n\nUse the conflict_scan tool on that URL to find which active plugin causes it. Skip these plugins so the shop keeps working during the scan: [comma-separated plugin files, or \"none\"]. Run it now — I understand each plugin is briefly off during its own test.\n\nWhen you have the culprit: explain what it collides with, check the debug log if one is readable, and propose the smallest safe fix (a snippet, a version pin, or a replacement plugin). Ask me before deactivating anything permanently."
  },
  {
    "id": "speed-audit",
    "title": "Find What Is Actually Making This Site Slow",
    "summary": "Hunt down slow queries, uncached loops, autoloaded option bloat and render-blocking assets — then fix the top offenders.",
    "time": "20–40 min",
    "tags": [
      "Performance"
    ],
    "tools": [
      "get_wp_skill",
      "db_query",
      "read_file",
      "edit_file",
      "render_page",
      "flush_cache"
    ],
    "prompt": "Find out why [page URL, e.g. the shop or homepage] is slow, and fix the top three causes.\n\n1. Load the bundled wp-performance-review skill and follow it.\n2. Check the size of autoloaded options with db_query (sum of option data where autoload = yes, plus the ten biggest rows) and tell me what is bloating it.\n3. Read the active theme and our custom plugins for the classic offenders: queries inside loops, posts_per_page => -1, meta_query without an index, uncached remote requests, get_option in a loop, missing transients.\n4. Render the page and list render-blocking scripts and styles that are loaded site-wide but only used on one template.\n5. Report findings ranked by expected impact, then fix the top three, showing me each diff first. Flush caches when done."
  },
  {
    "id": "plugin-bloat",
    "title": "Audit Plugin Bloat and Retire the Dead Weight",
    "summary": "Inventory every plugin, flag the abandoned and the redundant, and lay out a safe removal order.",
    "time": "15–30 min",
    "tags": [
      "Maintenance",
      "Plugins"
    ],
    "tools": [
      "list_plugins",
      "site_info",
      "db_query",
      "set_plugin_state"
    ],
    "prompt": "Give me an honest inventory of the plugins on this site.\n\nList every installed plugin with version and active state. For each one tell me: what it does here, whether anything on the site still uses it, whether two plugins overlap (two SEO plugins, three caching plugins, four form plugins), and which look abandoned or superseded by core.\n\nThen give me a removal plan in a safe order — deactivate first, what to watch after each removal, and what data each one leaves behind in the database. Do not deactivate or delete anything until I confirm the list."
  },
  {
    "id": "user-audit",
    "title": "Audit Users, Roles and Admin Access",
    "summary": "Find stale administrators, unexpected role grants and accounts nobody remembers creating.",
    "time": "10–20 min",
    "tags": [
      "Security",
      "Users"
    ],
    "tools": [
      "list_users",
      "get_users",
      "db_query",
      "update_users"
    ],
    "prompt": "Audit who can get into this site.\n\nList every user with the administrator or editor role, when they last posted, and their registration date. Use db_query to check usermeta for capability grants that do not match a normal role, and flag any account whose email domain is not [our domain].\n\nGive me a table of \"keep / downgrade / remove\", with a reason per row. Do not change any account until I approve the table — then apply exactly what I approve."
  },
  {
    "id": "health-report",
    "title": "Weekly Site Health Report",
    "summary": "One readable status page: versions, content counts, pending updates, database weight and anything that changed.",
    "time": "5–10 min",
    "tags": [
      "Reporting",
      "Maintenance"
    ],
    "tools": [
      "site_info",
      "count_posts",
      "count_terms",
      "list_plugins",
      "db_query",
      "list_comments"
    ],
    "prompt": "Write me a site health report for this WordPress install, in plain language, as a short markdown document.\n\nCover: WordPress and PHP versions, active theme, how many plugins are active vs installed and which are outdated, content counts by post type and status, pending comments and spam, the ten largest database tables, total autoloaded option size, and the last few things changed on the site.\n\nEnd with a \"what I would do this week\" section: at most five concrete items, ordered by value. No filler."
  },
  {
    "id": "build-plugin",
    "title": "Turn a Plain-English Spec into a Real Plugin",
    "summary": "Describe the behaviour you want; get a properly structured, escaped, nonce-checked plugin scaffolded and activated on the site.",
    "time": "30–60 min",
    "tags": [
      "Development",
      "Plugins"
    ],
    "tools": [
      "get_wp_skill",
      "create_plugin",
      "write_file",
      "edit_file",
      "set_plugin_state"
    ],
    "prompt": "Build me a small WordPress plugin on this site.\n\nWhat it should do: [describe the behaviour in plain language — e.g. \"add a Delivery Date field to the checkout, store it on the order, show it in the admin order screen and in the order confirmation email\"].\n\nRules:\n- Load the bundled wp-plugin-development skill first and follow its structure and naming conventions.\n- Prefix everything with [your prefix], text domain [your-text-domain].\n- Escape all output, sanitize all input, check capabilities and nonces on every write path.\n- Scaffold with create_plugin, then write the real files. Show me the plan and the file list before you write code.\n- Activate it when it is done and tell me exactly how to test it."
  },
  {
    "id": "rest-endpoint",
    "title": "Add a Custom REST Endpoint the Right Way",
    "summary": "A registered route with a real permission callback, an argument schema, and a response shape that will not drift.",
    "time": "20–40 min",
    "tags": [
      "Development",
      "REST API"
    ],
    "tools": [
      "get_wp_skill",
      "write_file",
      "edit_file",
      "wp_rest"
    ],
    "prompt": "Add a REST endpoint to this site.\n\nRoute: [namespace/v1/thing]. It should [what it returns or accepts]. Who may call it: [logged-out / logged-in / a specific capability].\n\nLoad the bundled wp-rest-api-development skill first and follow it. I want a real permission_callback (never __return_true unless the data is genuinely public and you say so out loud), an args schema with sanitize and validate callbacks, and a documented response shape.\n\nPut it in [existing plugin folder, or scaffold a new one]. When it is live, call it through the bridge and show me the actual response."
  },
  {
    "id": "child-theme",
    "title": "Restyle the Site Safely with a Child Theme",
    "summary": "Move custom CSS and template overrides out of the parent theme so the next update stops eating your work.",
    "time": "20–40 min",
    "tags": [
      "Theme",
      "Design"
    ],
    "tools": [
      "list_themes",
      "list_files",
      "read_file",
      "write_file",
      "preview_url",
      "activate_theme"
    ],
    "prompt": "Set up a proper child theme for the active theme on this site, then move my customizations into it.\n\n1. Create the child theme (style.css header, functions.php enqueueing the parent stylesheet correctly, screenshot optional).\n2. Find customizations that currently live in the parent theme or in Additional CSS and move them across, template overrides included.\n3. Then make this design change: [describe the change — colors, spacing, header layout, fonts].\n4. Give me a preview URL of the child theme before activating anything. I will tell you when to activate."
  },
  {
    "id": "preview-before-publish",
    "title": "Redesign a Theme and Preview It Before Publishing",
    "summary": "Work on an inactive theme, look at it through a tokened preview URL, and only publish when it is right.",
    "time": "30–60 min",
    "tags": [
      "Theme",
      "Design"
    ],
    "tools": [
      "list_themes",
      "read_file",
      "write_file",
      "edit_file",
      "preview_url",
      "render_page",
      "activate_theme"
    ],
    "prompt": "Redesign [theme slug] without touching the live site.\n\nThe theme is installed but not active. Work directly in its files, then give me a preview_url so I can see it while visitors still get the current design.\n\nThe brief: [what should change — \"make it feel like [reference site]\", brand colors [hex codes], the header should [ … ]].\n\nIterate with me on the preview. Render the page yourself between changes to check you did not break the layout. Only activate the theme when I say so."
  },
  {
    "id": "landing-page",
    "title": "Build a Landing Page from a Brief",
    "summary": "One paragraph of intent in, a complete published page with real sections and internal links out.",
    "time": "20–40 min",
    "tags": [
      "Content",
      "Design"
    ],
    "tools": [
      "create_pages",
      "update_pages",
      "list_pages",
      "upload_media_from_url",
      "render_page"
    ],
    "prompt": "Build a landing page on this site.\n\nGoal: [what the page must get people to do]. Audience: [who they are]. Offer: [what we are selling or giving away]. Tone: [how it should read].\n\nStructure it as hero, problem, solution, proof, objections, call to action — adapt if something else fits better and tell me why. Match the existing site voice: read two or three published pages first.\n\nCreate it as a draft at [/slug], link it from [where], and give me the preview link. Do not publish until I approve."
  },
  {
    "id": "navigation-rebuild",
    "title": "Rebuild the Site Navigation",
    "summary": "Audit the menus against what the site actually contains, then rebuild them so people can find things.",
    "time": "15–30 min",
    "tags": [
      "Content",
      "UX"
    ],
    "tools": [
      "list_menus",
      "list_menu_items",
      "create_menu_items",
      "update_menu_items",
      "delete_menu_items",
      "list_pages"
    ],
    "prompt": "Fix this site's navigation.\n\nList every menu and every menu item, and cross-check against the published pages and post types. Tell me which items point at missing or redirected pages, which important pages are unreachable from the menu, and where the hierarchy is confusing.\n\nThen propose a new structure for [menu name] — maximum [number] top-level items — and once I approve it, build it. Keep the old menu intact until the new one is live."
  },
  {
    "id": "alt-text-sweep",
    "title": "Fill In Every Missing Image Alt Text",
    "summary": "Find media items with no alt text, write descriptive alternatives that fit the page they are used on, and save them.",
    "time": "15–30 min",
    "tags": [
      "Media",
      "Accessibility",
      "SEO"
    ],
    "tools": [
      "list_media",
      "get_media",
      "update_media",
      "db_query",
      "get_meta",
      "update_meta"
    ],
    "prompt": "Fix the missing image alt text on this site.\n\nFind attachments with an empty _wp_attachment_image_alt. For each one, look at the filename, caption and the post it is attached to, then write an alt text that describes what is in the image for someone who cannot see it — not a keyword list, and no \"image of\".\n\nDo the first ten, show me the before/after table, and wait for my go-ahead before doing the rest. Skip purely decorative images and tell me which ones you skipped."
  },
  {
    "id": "content-calendar",
    "title": "Draft and Schedule a Month of Posts",
    "summary": "Turn a list of topics into scheduled drafts with categories, tags, excerpts and internal links already in place.",
    "time": "30–60 min",
    "tags": [
      "Content"
    ],
    "tools": [
      "list_posts",
      "create_posts",
      "update_posts",
      "list_categories",
      "create_tags"
    ],
    "prompt": "Plan and draft a month of posts for this site.\n\nTopics: [list them, or say \"propose them from what already ranks here\"]. Publishing rhythm: [e.g. every Tuesday and Thursday at 09:00]. Length: [words]. Voice: read the five most recent published posts and match them.\n\nFor each post: a working title, an excerpt, the right existing category (do not invent new ones without asking), tags, and two or three internal links to relevant existing posts. Create them as scheduled drafts. Give me the calendar as a table when you are done."
  },
  {
    "id": "bulk-find-replace",
    "title": "Bulk Find-and-Replace Across Posts and Pages",
    "summary": "Change a name, a URL or a phone number everywhere it appears — with a dry run first and revisions to fall back on.",
    "time": "10–20 min",
    "tags": [
      "Content",
      "Maintenance"
    ],
    "tools": [
      "search",
      "db_query",
      "get_posts",
      "update_posts",
      "list_revisions",
      "restore_revision"
    ],
    "prompt": "Replace [old text] with [new text] across this site's content.\n\nFirst, a dry run: use search and db_query to show me every post, page and custom post type item that contains it, with the surrounding sentence, and count them. Include post content, excerpts and titles. Flag anything inside a shortcode, a block attribute or a URL, because those need care.\n\nAfter I approve the list, apply the change post by post so WordPress records a revision each time, and give me the list of edited IDs so we can roll back."
  },
  {
    "id": "media-cleanup",
    "title": "Spring-Clean the Media Library",
    "summary": "Find oversized, duplicated and completely unused uploads, and get the disk back without breaking a page.",
    "time": "20–40 min",
    "tags": [
      "Media",
      "Performance"
    ],
    "tools": [
      "list_media",
      "db_query",
      "delete_media",
      "get_posts"
    ],
    "prompt": "Clean up the media library on this site.\n\nReport, do not delete yet: the 30 largest files with their dimensions, images wider than 2500px that are only ever displayed small, obvious duplicates (same name with -1, -2 suffixes), and attachments that no post, page, meta field or theme option references.\n\nFor the unused list, be conservative and say how you checked. Then propose what to delete and what to regenerate at a sane size. I will approve in batches."
  },
  {
    "id": "broken-links",
    "title": "Find Broken Links and Fix the 404s",
    "summary": "Crawl your own content for dead internal links, missing images and old URLs, then repair or redirect them.",
    "time": "20–40 min",
    "tags": [
      "SEO",
      "Maintenance"
    ],
    "tools": [
      "db_query",
      "search",
      "get_posts",
      "update_posts",
      "render_page",
      "preview_url"
    ],
    "prompt": "Find and fix broken links on this site.\n\nPull every internal link and image URL out of published content, check which ones resolve, and give me a table of broken targets with the posts that link to them.\n\nFor each broken link, propose the fix: the correct current URL, a redirect, or removal. Apply the ones I approve, editing the content directly. List anything that needs a redirect rule I have to add at the server or plugin level."
  },
  {
    "id": "accessibility-pass",
    "title": "Accessibility Pass on the Templates People Actually Use",
    "summary": "Keyboard traps, unlabelled controls, heading order and focus states — reviewed in the markup and fixed at the source.",
    "time": "30–60 min",
    "tags": [
      "Accessibility",
      "Theme"
    ],
    "tools": [
      "get_wp_skill",
      "render_page",
      "read_file",
      "edit_file"
    ],
    "prompt": "Do an accessibility pass on this site.\n\nLoad the bundled wp-accessibility-review skill and follow it. Templates to review: [homepage, single post, the main archive, checkout — adjust to this site].\n\nRender each one and check the real markup: heading order, landmarks, form labels, alt text, focus styles, keyboard operability of menus and modals, ARIA that contradicts the element it sits on, and controls that are only reachable with a mouse.\n\nReport issues grouped by template with the offending markup, then fix them in the theme files, showing me each diff. Do not add an accessibility overlay."
  },
  {
    "id": "theme-json-rebrand",
    "title": "Rebrand the Whole Site from theme.json",
    "summary": "Set real design tokens once — palette, type scale, spacing — instead of sprinkling CSS overrides everywhere.",
    "time": "20–40 min",
    "tags": [
      "Block theme",
      "Design"
    ],
    "tools": [
      "get_wp_skill",
      "read_file",
      "write_file",
      "edit_file",
      "render_page"
    ],
    "prompt": "Rebrand this block theme through theme.json instead of custom CSS.\n\nBrand colors: [hex codes and what each is for]. Heading font: [font]. Body font: [font]. Feel: [tight and technical / soft and editorial / …].\n\nLoad the bundled wp-theme-development skill first. Read the current theme.json, then set the palette, gradients, font families and sizes, and spacing scale as proper presets. Replace hardcoded colors and font sizes in templates and CSS with the presets you just defined.\n\nWork in a child theme if the active theme is from wordpress.org. Render the homepage and a single post before and after, and tell me what still needs manual attention."
  },
  {
    "id": "reusable-pattern",
    "title": "Turn a Page Section into a Reusable Pattern",
    "summary": "Stop rebuilding the same call-to-action by hand: register it as a real pattern editors can drop in.",
    "time": "15–30 min",
    "tags": [
      "Block theme",
      "Content"
    ],
    "tools": [
      "get_pages",
      "get_posts",
      "write_file",
      "list_blocks",
      "create_blocks"
    ],
    "prompt": "Turn the [name the section — e.g. \"book a call\" band at the bottom of the services page] into a reusable block pattern.\n\nRead the block markup from [page URL or ID], clean it up (no leftover inline styles, use theme.json presets, keep it responsive), and register it as a pattern in the active theme with a sensible title, category and keywords.\n\nThen show me which existing pages contain a hand-built copy of that section, so I can decide whether to swap them over."
  },
  {
    "id": "classic-to-block",
    "title": "Plan the Move from a Classic Theme to a Block Theme",
    "summary": "An honest inventory of what a full-site-editing migration would cost here, before anyone commits to it.",
    "time": "30–60 min",
    "tags": [
      "Theme",
      "Migration"
    ],
    "tools": [
      "get_wp_skill",
      "list_themes",
      "list_files",
      "read_file",
      "site_info"
    ],
    "prompt": "Tell me what it would really take to move this site from its classic theme to a block theme.\n\nLoad the bundled wp-theme-development skill. Then inventory the active theme: template files and what each does, custom template tags, widget areas, menus, customizer settings, shortcodes, custom post types tied to templates, and anything that depends on the loop being classic.\n\nGive me a migration plan in phases with an effort estimate per phase, what breaks if we do nothing, and what could move to a hybrid setup first. Be blunt about the parts that are not worth migrating. Do not change anything yet."
  },
  {
    "id": "woo-noindex-categories",
    "title": "Bulk Noindex WooCommerce Product Categories",
    "summary": "Thin and duplicate category archives quietly eat your crawl budget. Mark the right ones noindex in one pass.",
    "time": "10–20 min",
    "tags": [
      "WooCommerce",
      "SEO"
    ],
    "tools": [
      "list_product_categories",
      "get_meta",
      "update_meta",
      "db_query",
      "count_terms"
    ],
    "prompt": "Set the right WooCommerce product categories to noindex.\n\nList every product category with its product count, whether it has a description, and its current index setting from the SEO plugin's term meta. Recommend noindex for: categories with fewer than [number] products, categories with no description, and [any other rule you want].\n\nShow me the table with your recommendation per category first. After I approve, write the noindex term meta for exactly the approved ones and confirm what changed. Do not touch categories that receive traffic — flag those instead."
  },
  {
    "id": "woo-low-stock",
    "title": "Low-Stock Report and Restock Plan",
    "summary": "What is nearly out, what sells fastest, and what to order first — from the real order data.",
    "time": "10–20 min",
    "tags": [
      "WooCommerce",
      "Reporting"
    ],
    "tools": [
      "list_products",
      "get_products",
      "list_orders",
      "db_query",
      "update_products"
    ],
    "prompt": "Give me a restock plan for this shop.\n\nList products at or below their low-stock threshold, and for each one work out how many units sold in the last [30/60/90] days from completed orders, so I can see how long the remaining stock lasts.\n\nSort by urgency (days of cover remaining, revenue at risk). Include out-of-stock products that still get orders attempted. Present it as a table I can hand to a supplier. Do not change any stock levels."
  },
  {
    "id": "woo-sale",
    "title": "Launch a Seasonal Sale: Coupons and Scheduled Prices",
    "summary": "Set sale prices with real start and end dates, generate the coupons, and check nothing sells below cost.",
    "time": "20–40 min",
    "tags": [
      "WooCommerce",
      "Marketing"
    ],
    "tools": [
      "list_products",
      "update_products",
      "create_coupons",
      "list_coupons",
      "create_pages"
    ],
    "prompt": "Set up a [occasion] sale on this shop.\n\nScope: [which categories or products]. Discount: [percentage or amount]. Runs from [date] to [date].\n\n1. Show me the affected products with current price, proposed sale price, and margin if cost data exists. Flag anything that would sell at a loss.\n2. After I approve, set scheduled sale prices with the exact start and end dates so they expire on their own.\n3. Create a coupon: code [CODE], [restrictions — minimum spend, one per customer, excluded categories].\n4. Draft a sale landing page listing the discounted products, and tell me what to check on the day the sale ends."
  },
  {
    "id": "woo-failed-orders",
    "title": "Investigate Failed and Stuck Orders",
    "summary": "Money that never arrived: group the failures by cause, and separate the payment problems from the site problems.",
    "time": "15–30 min",
    "tags": [
      "WooCommerce",
      "Troubleshooting"
    ],
    "tools": [
      "list_orders",
      "get_orders",
      "db_query",
      "get_meta",
      "render_page"
    ],
    "prompt": "Work out why orders are failing on this shop.\n\nPull orders with status failed, pending or on-hold from the last [30] days. Group them by payment method, error note, product, country and total value, and tell me which pattern accounts for most of the lost revenue.\n\nSeparate gateway declines (the customer's bank) from site-side failures (fatal errors, timeouts, a plugin conflict at checkout). For the site-side ones, dig into the order notes and reproduce what you can. Give me the top three causes and the fix for each."
  },
  {
    "id": "woo-product-copy",
    "title": "Rewrite Thin Product Descriptions",
    "summary": "Find products with copy pasted from the manufacturer or no copy at all, and give them something worth reading.",
    "time": "30–60 min",
    "tags": [
      "WooCommerce",
      "Content",
      "SEO"
    ],
    "tools": [
      "list_products",
      "get_products",
      "update_products",
      "db_query"
    ],
    "prompt": "Improve the product copy in this shop.\n\nFind products whose description is empty, under [80] words, or identical to another product's. Start with the [20] that sell best.\n\nFor each: a short description that leads with the benefit and the one fact that decides the purchase, and a long description covering what it is, who it is for, specifications, and what is in the box. Keep our voice — read three of the best existing descriptions first. Never invent specifications; if you need a fact I have not given you, leave a clearly marked [TO CONFIRM].\n\nShow me the first five before continuing, then update the products."
  },
  {
    "id": "woo-checkout-review",
    "title": "Review a Customized Checkout Before It Costs You Sales",
    "summary": "Custom checkout code is where HPOS breakage, security holes and silent order failures hide.",
    "time": "30–60 min",
    "tags": [
      "WooCommerce",
      "Code review"
    ],
    "tools": [
      "get_wp_skill",
      "list_plugins",
      "list_files",
      "read_file",
      "edit_file"
    ],
    "prompt": "Review every customization we have made to the WooCommerce checkout and cart.\n\nLoad the bundled wp-woocommerce-dev skill and follow it. Look in the active theme (including any woocommerce/ template overrides) and in our custom plugins.\n\nI want to know: which template overrides are outdated compared to the plugin's current versions, any direct post-meta access that breaks under HPOS, missing nonce or capability checks on checkout hooks, anything doing remote requests during checkout, and cart fragment abuse.\n\nReport first, with file:line and impact. Then fix in order of risk, one diff at a time."
  },
  {
    "id": "elementor-header-footer",
    "title": "Create a Global Elementor Header and Footer",
    "summary": "One header and one footer applied everywhere, instead of a slightly different copy on each page.",
    "time": "20–40 min",
    "tags": [
      "Elementor",
      "Design"
    ],
    "tools": [
      "list_templates",
      "get_templates",
      "create_templates",
      "list_pages",
      "update_pages",
      "render_page"
    ],
    "prompt": "Build a global header and footer for this Elementor site.\n\nFirst tell me what exists today: theme header/footer, Elementor templates, and any per-page overrides that would fight a global one.\n\nHeader should contain: [logo, menu, phone number, call-to-action button — adjust]. Footer should contain: [columns, links, contact details, copyright].\n\nBuild them as templates applied site-wide, match the existing brand colors and fonts (read them from the site, do not guess), and make sure they work on mobile. Then list the pages that still carry their own copy so I can clear them out."
  },
  {
    "id": "elementor-slim-down",
    "title": "Slim Down a Bloated Elementor Page",
    "summary": "Nested sections, unused widgets and five font weights: find the weight and take it out without changing the design.",
    "time": "20–40 min",
    "tags": [
      "Elementor",
      "Performance"
    ],
    "tools": [
      "get_pages",
      "db_query",
      "render_page",
      "list_plugins",
      "flush_cache"
    ],
    "prompt": "Make [page URL] lighter without changing how it looks.\n\nRender it and analyze what is actually loaded: Elementor widget CSS and JS files, Google Fonts and their weights, icon libraries, images served far larger than displayed, and third-party embeds.\n\nRead the page's Elementor data and tell me about deeply nested sections, empty containers, widgets that are hidden on every breakpoint, and animations nobody sees. Give me a ranked list of what to remove or replace with the expected saving, then apply the ones I approve and flush the cache."
  },
  {
    "id": "seo-meta-sweep",
    "title": "Fix Missing SEO Titles and Meta Descriptions",
    "summary": "Every page that leaves it to the plugin default gets a written title and description that matches its content.",
    "time": "20–40 min",
    "tags": [
      "SEO",
      "Content"
    ],
    "tools": [
      "db_query",
      "list_posts",
      "list_pages",
      "get_meta",
      "update_meta"
    ],
    "prompt": "Fill in the missing SEO titles and meta descriptions on this site.\n\nFind published posts, pages and product pages with no custom SEO title or description in the SEO plugin's meta (check what this site actually uses first). Start with the [30] that get the most internal links.\n\nWrite a title under 60 characters and a description between 140 and 160 that reflects what is really on the page — read the content, do not pattern-match the title. No clickbait, no keyword stuffing.\n\nShow me the first ten as a table, then write the rest after I approve the style."
  },
  {
    "id": "acf-content-model",
    "title": "Model a New Content Type with ACF",
    "summary": "Design the fields before building the templates, and keep the definitions in version control where they belong.",
    "time": "30–60 min",
    "tags": [
      "ACF",
      "Development"
    ],
    "tools": [
      "get_wp_skill",
      "list_post_types",
      "write_file",
      "read_file",
      "list_files"
    ],
    "prompt": "Design and build a content type on this site: [e.g. \"case studies\", \"team members\", \"properties\"].\n\nLoad the bundled wp-acf-and-content-modeling skill and follow it. Look at how existing post types and field groups are defined here and stay consistent.\n\nGive me the model first: post type, taxonomies, every field with its type, name, and why it exists — plus what should NOT be a field. Point out anything that will be slow to query later.\n\nAfter I approve the model: register the post type in a plugin (not the theme), create the field group, save it as ACF JSON in the repo, and build the template that renders it."
  },
  {
    "id": "forms-review",
    "title": "Audit the Forms People Actually Submit",
    "summary": "Check that submissions arrive, that notifications work, and that the form is not leaking or storing what it should not.",
    "time": "15–30 min",
    "tags": [
      "Forms",
      "Security"
    ],
    "tools": [
      "list_plugins",
      "db_query",
      "get_posts",
      "render_page",
      "get_settings"
    ],
    "prompt": "Audit the forms on this site.\n\nList every form, where it is embedded, where its submissions go (email, database, external service), and when it last received one. Flag forms with no recent submissions — they are usually broken, not unpopular.\n\nCheck the notification addresses still exist, whether the site can send mail at all, whether spam protection is active, and whether any form stores personal data it does not need or exposes entries to the wrong role.\n\nGive me the problems with a fix for each, worst first."
  },
  {
    "id": "multisite-plugin-audit",
    "title": "Network-Wide Plugin and Theme Audit",
    "summary": "See what every site in the network is running, and where the versions have drifted apart.",
    "time": "20–40 min",
    "tags": [
      "Multisite",
      "Maintenance"
    ],
    "tools": [
      "list_plugins",
      "list_themes",
      "db_query",
      "site_info"
    ],
    "prompt": "Audit this multisite network.\n\nFor every site: active theme, active plugins, WordPress version state, and anything network-activated but disabled locally. Show me where the drift is — plugins active on some sites and not others, themes nobody uses, sites left on abandoned plugins.\n\nThen recommend what to network-activate, what to remove, and what needs a per-site decision. Be explicit about which changes touch every site at once. Change nothing until I approve."
  },
  {
    "id": "onboard-site",
    "title": "Onboard: Tell Me What This Site Even Is",
    "summary": "You just inherited a WordPress site. Get an orientation before you touch anything.",
    "time": "10–20 min",
    "tags": [
      "Onboarding",
      "Reporting"
    ],
    "tools": [
      "get_wp_skill",
      "site_info",
      "list_plugins",
      "list_themes",
      "list_files",
      "count_posts",
      "db_query"
    ],
    "prompt": "I just inherited this WordPress site and know nothing about it. Orient me.\n\nLoad the bundled wp-site-audit-and-onboarding skill and follow it.\n\nTell me: what the site is for, what stack it runs (page builder, shop, headless, multisite, custom plugins), which code is custom and therefore ours to maintain, where the customizations live, what looks abandoned, and what would scare you if you had to deploy a change tomorrow.\n\nFinish with the three things I should look at first, and which of this cookbook's recipes fit this site."
  }
]
