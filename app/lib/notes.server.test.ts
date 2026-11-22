import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { getNote, getNotesForStudent, saveNote } from "./notes.server";
import { MAX_NOTE_LENGTH } from "./notes";

type TestDb = ReturnType<typeof createTestDb>;

const NOW = new Date(2026, 9, 6, 12, 0, 0);
const LATER = new Date(2026, 9, 7, 12, 0, 0);

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

function allNoteRows() {
  return db.select().from(schema.notes).all();
}

describe("saving a Note", () => {
  it("creates the Note on first save", () => {
    expect(saveNote(db, base.user.id, lessonId, "First thought", NOW)).toEqual({
      ok: true,
    });

    expect(getNote(db, base.user.id, lessonId)).toMatchObject({
      body: "First thought",
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    });
  });

  it("updates the same Note on a second save, bumping only updatedAt", () => {
    saveNote(db, base.user.id, lessonId, "First thought", NOW);
    saveNote(db, base.user.id, lessonId, "Second thought", LATER);

    expect(allNoteRows()).toHaveLength(1);
    expect(getNote(db, base.user.id, lessonId)).toMatchObject({
      body: "Second thought",
      createdAt: NOW.toISOString(),
      updatedAt: LATER.toISOString(),
    });
  });

  it("trims leading and trailing whitespace but keeps inner line breaks", () => {
    saveNote(db, base.user.id, lessonId, "\n\n  line one\nline two  \n", NOW);

    expect(getNote(db, base.user.id, lessonId)?.body).toBe(
      "line one\nline two"
    );
  });

  it.each(["", "   \n\t "])("deletes the Note when saved as %j", (body) => {
    saveNote(db, base.user.id, lessonId, "Something", NOW);

    expect(saveNote(db, base.user.id, lessonId, body, LATER)).toEqual({
      ok: true,
    });
    expect(getNote(db, base.user.id, lessonId)).toBeUndefined();
  });

  it(`saves a Note of exactly ${MAX_NOTE_LENGTH} characters`, () => {
    const body = "a".repeat(MAX_NOTE_LENGTH);

    expect(saveNote(db, base.user.id, lessonId, body, NOW)).toEqual({
      ok: true,
    });
    expect(getNote(db, base.user.id, lessonId)?.body).toBe(body);
  });

  it("refuses a Note one character over the cap and leaves the old one alone", () => {
    saveNote(db, base.user.id, lessonId, "Keep me", NOW);

    const result = saveNote(
      db,
      base.user.id,
      lessonId,
      "a".repeat(MAX_NOTE_LENGTH + 1),
      LATER
    );

    expect(result).toMatchObject({ ok: false });
    expect(getNote(db, base.user.id, lessonId)).toMatchObject({
      body: "Keep me",
      updatedAt: NOW.toISOString(),
    });
  });

  it("measures the length after trimming", () => {
    const body = `   ${"a".repeat(MAX_NOTE_LENGTH)}   `;

    expect(saveNote(db, base.user.id, lessonId, body, NOW)).toEqual({
      ok: true,
    });
  });
});

describe("listing a Student's Notes", () => {
  it("returns only their Notes, most recently edited first, with each Lesson's place", () => {
    saveNote(db, base.user.id, lessonId, "Older", NOW);
    saveNote(db, base.user.id, otherLessonId, "Newer", LATER);
    saveNote(db, otherStudentId, lessonId, "Not yours", LATER);

    const saved = getNotesForStudent(db, base.user.id);

    expect(saved).toHaveLength(2);
    expect(saved[0]).toMatchObject({
      body: "Newer",
      lessonId: otherLessonId,
      lessonTitle: "Lesson 2",
      courseTitle: "Test Course",
      courseSlug: "test-course",
      updatedAt: LATER.toISOString(),
    });
    expect(saved[1]).toMatchObject({ body: "Older", lessonId });
  });

  it("moves an edited Note to the top", () => {
    saveNote(db, base.user.id, lessonId, "First", NOW);
    saveNote(db, base.user.id, otherLessonId, "Second", NOW);
    saveNote(db, base.user.id, lessonId, "First, edited", LATER);

    expect(getNotesForStudent(db, base.user.id)[0]).toMatchObject({
      lessonId,
      body: "First, edited",
    });
  });
});
