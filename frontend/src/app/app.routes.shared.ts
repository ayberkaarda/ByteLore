import { Routes } from '@angular/router';

import { requireRole } from './core/auth/role.guard';

/**
 * Every screen in the application, written once and platform-free.
 *
 * The two builds address these routes differently — the web puts a language
 * segment in front of every one of them for search engines to index per
 * language, the desktop has no such segment because it has no addresses to
 * index — so the shape that differs lives in the two thin files that wrap
 * this one, and the shape that does not lives here.
 *
 * Neither wrapper imports the other. They are a `fileReplacements` pair, and
 * a replaced file that imports back from its replacement resolves against
 * whichever copy the bundler reached first, silently and differently per
 * build; keeping what they share in a third file that is never replaced is
 * what removes the question.
 *
 * Every feature route is loaded on demand. The shell is what the first paint
 * needs; a track the user has not asked for is not.
 *
 * Content is addressed by slug throughout, because a slug is what a deep link
 * carries and what survives a lesson being moved between modules. Identifiers
 * stay inside the platform layer.
 */
export const SHARED_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'tracks' },
  {
    path: 'tracks',
    loadComponent: () => import('./features/tracks/track-list.page').then((m) => m.TrackListPage),
  },
  {
    path: 'tracks/:trackSlug',
    loadComponent: () =>
      import('./features/tracks/track-detail.page').then((m) => m.TrackDetailPage),
  },
  {
    path: 'tracks/:trackSlug/mindmap',
    loadComponent: () => import('./features/mind-map/mind-map.page').then((m) => m.MindMapPage),
  },
  {
    path: 'tracks/:trackSlug/lessons/:lessonSlug',
    loadComponent: () => import('./features/lessons/lesson.page').then((m) => m.LessonPage),
  },
  {
    path: 'blog',
    loadComponent: () => import('./features/blog/blog-list.page').then((m) => m.BlogListPage),
  },
  {
    path: 'blog/:slug',
    loadComponent: () => import('./features/blog/blog-post.page').then((m) => m.BlogPostPage),
  },
  {
    /*
     * The one screen here that needs a session and a connection, and the one
     * gate that is about being signed in rather than about a role: a shared
     * daily puzzle with a scoreboard and a streak is a claim about when
     * something happened relative to other people, which nothing local can
     * settle. Listing all three roles rather than leaving the route open is
     * what sends an anonymous visitor to sign in, carrying where they were
     * going, instead of to a screen that can only report a refusal.
     */
    path: 'puzzle',
    canActivate: [requireRole(['USER', 'EDITOR', 'ADMIN'])],
    loadComponent: () => import('./features/puzzle/puzzle.page').then((m) => m.PuzzlePage),
  },
  {
    path: 'downloads',
    loadComponent: () => import('./features/downloads/downloads.page').then((m) => m.DownloadsPage),
  },
  {
    path: 'settings',
    loadComponent: () => import('./features/settings/settings.page').then((m) => m.SettingsPage),
  },
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'admin',
    canActivate: [requireRole(['EDITOR', 'ADMIN'])],
    loadChildren: () => import('./features/admin/admin.routes').then((m) => m.ADMIN_ROUTES),
  },
  {
    path: '**',
    loadComponent: () => import('./features/not-found/not-found.page').then((m) => m.NotFoundPage),
  },
];
