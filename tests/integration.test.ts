import { describe, expect, it } from 'vitest';
import type { TrainJourney } from '../src/domain/train.js';
import { Rail12306Provider } from '../src/providers/rail12306.js';

const live = process.env.RUN_LIVE_12306 === '1';
const integration = live ? describe : describe.skip;

integration('official 12306 public integration', () => {
  const provider = new Rail12306Provider();
  const travelDate = formatChinaDate(new Date(Date.now() + 3 * 24 * 60 * 60 * 1000));
  let journeys: TrainJourney[] = [];

  it('retrieves official station metadata and resolves the Shanghai–Hangzhou stations', async () => {
    await expect(provider.searchStations('上海虹桥')).resolves.toContainEqual(
      expect.objectContaining({ name: '上海虹桥', code: 'AOH' }),
    );
    await expect(provider.searchStations('杭州东')).resolves.toContainEqual(
      expect.objectContaining({ name: '杭州东', code: 'HGH' }),
    );
  }, 15_000);

  it('queries exact-station timetable, availability, and compact fares with an anonymous session', async () => {
    expect(provider.capabilities).toEqual({
      stationSearch: true,
      timetable: true,
      trainStops: true,
      fares: true,
      availability: true,
    });
    journeys = await provider.searchTrains({
      from: '上海虹桥',
      to: '杭州东',
      date: travelDate,
    });
    expect(journeys.length).toBeGreaterThan(0);
    expect(journeys.every((journey) => journey.departureStation === '上海虹桥')).toBe(true);
    expect(journeys.every((journey) => journey.arrivalStation === '杭州东')).toBe(true);
    expect(
      journeys.some((journey) =>
        journey.seatClasses.some((seat) => seat.availability && seat.fare),
      ),
    ).toBe(true);
  }, 20_000);

  it('resolves a returned train to its official stop sequence', async () => {
    const trainNumber = journeys[0]?.trainNumber;
    expect(trainNumber).toBeTruthy();
    const details = await provider.getTrainDetails({ trainNumber: trainNumber!, date: travelDate });
    expect(details.trainNumber).toBe(trainNumber);
    expect(details.stops.length).toBeGreaterThan(1);
  }, 20_000);

  it('queries a D train with fares, availability, and its official stop sequence', async () => {
    const dJourneys = await provider.searchTrains({
      from: 'AOH',
      to: 'NGH',
      date: travelDate,
    });
    const dJourney = dJourneys.find((journey) => journey.trainType === 'D');
    expect(dJourney).toMatchObject({
      trainType: 'D',
      trainTypeLabel: '动车组列车',
      departureStation: '上海虹桥',
      arrivalStation: '宁波',
    });
    expect(dJourney?.seatClasses.some((seat) => seat.availability && seat.fare)).toBe(true);

    const details = await provider.getTrainDetails({
      trainNumber: dJourney!.trainNumber,
      date: travelDate,
    });
    expect(details.trainNumber).toBe(dJourney!.trainNumber);
    expect(details.stops.length).toBeGreaterThan(1);
  }, 25_000);
});

function formatChinaDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}
