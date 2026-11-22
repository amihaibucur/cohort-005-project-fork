import { and, desc, eq } from "drizzle-orm";
import { bookmarks, courses, lessons, modules } from "~/db/schema";
import type { Db } from "~/lib/comments.server";

// ─── Bookmarks ───
// A Student's Bookmark on a Lesson, private to them. See GLOSSARY.md.
//
// Every function takes the database first, so tests can hand in an in-memory
// one. Uses positional parameters (project convention).

function findBookmark(db: Db, studentId: number, lessonId: number) {
  return db
    .select({ id: bookmarks.id })
    .from(bookmarks)
    .where(
      and(eq(bookmarks.userId, studentId), eq(bookmarks.lessonId, lessonId))
    )
    .get();
}

export function isBookmarked(db: Db, studentId: number, lessonId: number) {
  return !!findBookmark(db, studentId, lessonId);
}

/** Adds the Bookmark if the Student has none on the Lesson, else removes it. */
export function toggleBookmark(db: Db, studentId: number, lessonId: number) {
  const existing = findBookmark(db, studentId, lessonId);
  if (existing) {
    db.delete(bookmarks).where(eq(bookmarks.id, existing.id)).run();
    return;
  }
  db.insert(bookmarks).values({ userId: studentId, lessonId }).run();
}

/** The Student's Bookmarks, newest first, with where each Lesson lives. */
export function getBookmarksForStudent(db: Db, studentId: number) {
  return db
    .select({
      id: bookmarks.id,
      createdAt: bookmarks.createdAt,
      lessonId: lessons.id,
      lessonTitle: lessons.title,
      moduleTitle: modules.title,
      courseTitle: courses.title,
      courseSlug: courses.slug,
    })
    .from(bookmarks)
    .innerJoin(lessons, eq(lessons.id, bookmarks.lessonId))
    .innerJoin(modules, eq(modules.id, lessons.moduleId))
    .innerJoin(courses, eq(courses.id, modules.courseId))
    .where(eq(bookmarks.userId, studentId))
    .orderBy(desc(bookmarks.createdAt), desc(bookmarks.id))
    .all();
}
