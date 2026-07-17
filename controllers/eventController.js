const prisma = require("../config/prisma");
const agenda = require("../config/agenda");

const createEvent = async (req, res) => {
  try {
    const { title, description, date, location } = req.body;

    // FIX: The uploadToCloudinary middleware attaches an array of string URLs to req.body.coverImageUrl
    const coverImage =
      req.body.coverImageUrl && req.body.coverImageUrl.length > 0
        ? req.body.coverImageUrl[0]
        : null;

    const eventDate = new Date(date);

    if (eventDate <= new Date()) {
      return res
        .status(400)
        .json({ message: "Event date must be in the future." });
    }

    const newEvent = await prisma.event.create({
      data: {
        title,
        description,
        date: eventDate,
        location,
        coverImageUrl: coverImage, // Now securely assigns the string URL
      },
    });

    // Schedule deletion at the exact event time
    await agenda.schedule(eventDate, "delete-expired-event", {
      eventId: newEvent.id,
    });

    return res.status(201).json(newEvent);
  } catch (err) {
    console.error("Error creating event:", err);
    return res
      .status(500)
      .json({ message: "Failed to create event", error: err.message });
  }
};

const getUpcomingEvents = async (req, res) => {
  try {
    const events = await prisma.event.findMany({
      where: {
        date: { gt: new Date() }, // Strictly future events
      },
      orderBy: { date: "asc" },
    });
    return res.json(events);
  } catch (err) {
    console.error("Error fetching events:", err);
    return res.status(500).json({ message: "Failed to fetch events" });
  }
};

const deleteEvent = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.event.delete({ where: { id } });

    // Cancel the pending auto-delete job to keep the DB clean
    await agenda.cancel({ name: "delete-expired-event", "data.eventId": id });

    return res.json({ message: "Event deleted manually" });
  } catch (err) {
    if (err.code === "P2025") {
      return res.status(404).json({ message: "Event not found" });
    }
    console.error("Error deleting event:", err);
    return res.status(500).json({ message: "Failed to delete event" });
  }
};

module.exports = { createEvent, getUpcomingEvents, deleteEvent };
