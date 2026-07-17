const agenda = require("../config/agenda");
const prisma = require("../config/prisma");

agenda.define("delete-expired-event", async (job) => {
  const { eventId } = job.attrs.data;
  try {
    await prisma.event.delete({
      where: { id: eventId },
    });
    console.log(`✅ Auto-deleted expired event: ${eventId}`);
  } catch (error) {
    // If P2025, the event was already deleted manually by an admin. Ignore.
    if (error.code !== "P2025") {
      console.error(
        `❌ Failed to auto-delete event ${eventId}:`,
        error.message,
      );
    }
  }
});
