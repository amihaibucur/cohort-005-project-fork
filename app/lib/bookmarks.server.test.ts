import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import {
  getBookmarksForStudent,
  isBookmarked,
  toggleBookmark,
} from "./bookmarks.server";

type TestDb = ReturnType<typeof createTestDb>;

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let lessonId: number;
let otherLessonId: number;
let otherStudentId: number;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);

  const module = db
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "Basics", position: 1 })
    .returning()
    .get();
  lessonId = db
    .insert(schema.lessons)
    .values({ moduleId: module.id, title: "Lesson 1", position: 1 })
    .returning()
    .get().id;
  otherLessonId = db
    .insert(schema.lessons)
    .values({ moduleId: module.id, title: "Lesson 2", position: 2 })
    .returning()
    .get().id;
  otherStudentId = db
    .insert(schema.users)
    .values({
      name: "Other Student",
      email: "other@example.com",
      role: schema.UserRole.Student,
    })
    .returning()
    .get().id;
});

describe("toggling a Bookmark", () => {
  it("starts with the Lesson not Bookmarked", () => {
    expect(isBookmarked(db, base.user.id, lessonId)).toBe(false);
  });

  it("Bookmarks the Lesson, then removes the Bookmark", () => {
    toggleBookmark(db, base.user.id, lessonId);
    expect(isBookmarked(db, base.user.id, lessonId)).toBe(true);

    toggleBookmark(db, base.user.id, lessonId);
    expect(isBookmarked(db, base.user.id, lessonId)).toBe(false);
  });

  it("doesn't touch another Student's Bookmark", () => {
    toggleBookmark(db, otherStudentId, lessonId);
    toggleBookmark(db, base.user.id, lessonId);
    toggleBookmark(db, base.user.id, lessonId);

    expect(isBookmarked(db, otherStudentId, lessonId)).toBe(true);
    expect(isBookmarked(db, base.user.id, lessonId)).toBe(false);
  });
});

describe("listing a Student's Bookmarks", () => {
  it("returns only their Bookmarks, newest first, with where each Lesson lives", () => {
    db.insert(schema.bookmarks)
      .values([
        {
          userId: base.user.id,
          lessonId,
          createdAt: "2026-10-01T00:00:00.000Z",
        },
        {
          userId: base.user.id,
          lessonId: otherLessonId,
          createdAt: "2026-10-05T00:00:00.000Z",
        },
        {
          userId: otherStudentId,
          lessonId,
          createdAt: "2026-10-09T00:00:00.000Z",
        },
      ])
      .run();

    const saved = getBookmarksForStudent(db, base.user.id);

    expect(saved).toHaveLength(2);
    expect(saved[0]).toMatchObject({
      lessonId: otherLessonId,
      lessonTitle: "Lesson 2",
      moduleTitle: "Basics",
      courseTitle: "Test Course",
      courseSlug: "test-course",
      createdAt: "2026-10-05T00:00:00.000Z",
    });
    expect(saved[1]).toMatchObject({ lessonId, lessonTitle: "Lesson 1" });
  });

  it("is empty for a Student with no Bookmarks", () => {
    expect(getBookmarksForStudent(db, base.user.id)).toEqual([]);
  });
});
