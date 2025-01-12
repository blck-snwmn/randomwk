// test/index.spec.ts
import { env, fetchMock } from "cloudflare:test";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import worker from "../src/index";

// For now, you'll need to do something like this to get a correctly-typed
// `Request` to pass to `worker.fetch()`.
const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

beforeAll(() => {
	// Enable outbound request mocking...
	fetchMock.activate();
	// ...and throw errors if an outbound request isn't mocked
	fetchMock.disableNetConnect();
});

afterEach(() => {
	vi.restoreAllMocks();
	fetchMock.assertNoPendingInterceptors();
});

describe("GET /", () => {
	it("responds with 200", async () => {
		const request = new IncomingRequest("http://example.com");
		const response = await worker.fetch(request, env);
		expect(response.status).toBe(200);
	});
});

describe("GET /new", () => {
	it("responds with 302", async () => {
		const request = new IncomingRequest("http://example.com/new");
		const response = await worker.fetch(request, env);
		expect(response.status).toBe(302);

		const localtion = response.headers.get("Location");

		// location format is /pages/:uuid
		expect(localtion).not.toBeNull();
		expect(localtion).toMatch(/^\/page\/[a-f0-9-]+$/);
		// get random by uuid. exists key
		const uuid = localtion?.split("/").pop();
		expect(uuid).not.toBeUndefined();

		const random = await env.random.get(`uuid#${uuid}`);
		expect(random).toBe("");
	});
});

describe("GET /page/:uuid", () => {
	it("responds with 404(no uuid)", async () => {
		const uuid = crypto.randomUUID();
		const request = new IncomingRequest(`http://example.com/page/${uuid}`);
		const response = await worker.fetch(request, env);
		expect(response.status).toBe(404);

		const respText = await response.text();
		expect(respText).toBe("Not found");
	});

	it("responds with 404(no channel)", async () => {
		const uuid = crypto.randomUUID();

		await env.random.put(`uuid#${uuid}`, "");

		const request = new IncomingRequest(`http://example.com/page/${uuid}`);
		const response = await worker.fetch(request, env);
		expect(response.status).toBe(404);

		const respText = await response.text();
		expect(respText).toBe("No videos found");
	});

	it("responds with 200(already exists uuid value)", async () => {
		const uuid = crypto.randomUUID();

		const videoJosn = {};
		await env.random.put(`uuid#${uuid}`, JSON.stringify(videoJosn));

		const request = new IncomingRequest(`http://example.com/page/${uuid}`);
		const response = await worker.fetch(request, env);
		expect(response.status).toBe(200);
	});

	it("responds with 200(no uuid value)", async () => {
		const uuid = crypto.randomUUID();
		await env.random.put(`uuid#${uuid}`, "");

		const channelId = crypto.randomUUID();
		await env.random.put(`channel#${channelId}`, "");

		const videoJosn = {
			id: {
				videoId: "test",
			},
			snippet: {
				title: "test",
				description: "test",
				thumbnails: {
					default: {
						url: "test",
						width: 120,
						height: 90,
					},
					medium: {
						url: "test",
						width: 320,
						height: 180,
					},
					high: {
						url: "test",
						width: 480,
						height: 360,
					},
				},
			},
		};
		fetchMock
			.get("https://www.googleapis.com")
			.intercept({
				path: `youtube/v3/search?key=TEST_API_KEY&channelId=${channelId}&part=snippet,id&order=date&maxResults=20`,
			})
			.reply(
				200,
				{ items: [videoJosn] },
				{
					headers: {
						"Content-Type": "application/json",
					},
				},
			);

		const request = new IncomingRequest(`http://example.com/page/${uuid}`);
		const response = await worker.fetch(request, env);
		expect(response.status).toBe(200);

		const body = await response.text();
		expect(body).toContain(`http://example.com/share/${uuid}`);

		const random = await env.random.get(`uuid#${uuid}`);
		expect(random).toBe(JSON.stringify(videoJosn));
	});

	it("responds with 200(multi channel and videos)", async () => {
		const uuid = crypto.randomUUID();
		await env.random.put(`uuid#${uuid}`, "");

		const channelIdA = crypto.randomUUID();
		await env.random.put(`channel#${channelIdA}`, "");

		const channelIdB = crypto.randomUUID();
		await env.random.put(`channel#${channelIdB}`, "");

		const videoJosnForChannelA = {
			items: [
				{
					id: {
						videoId: "test_a",
					},
					snippet: {
						title: "test_a",
						description: "test_a",
						thumbnails: {
							default: {
								url: "test_a",
								width: 120,
								height: 90,
							},
							medium: {
								url: "test_a",
								width: 320,
								height: 180,
							},
							high: {
								url: "test_a",
								width: 480,
								height: 360,
							},
						},
					},
				},
				{
					id: {
						videoId: "test_b",
					},
					snippet: {
						title: "test_b",
						description: "test_b",
						thumbnails: {
							default: {
								url: "test_b",
								width: 120,
								height: 90,
							},
							medium: {
								url: "test_b",
								width: 320,
								height: 180,
							},
							high: {
								url: "test_b",
								width: 480,
								height: 360,
							},
						},
					},
				},
			],
		};
		const videoJosnForChannelB = {
			items: [
				{
					id: {
						videoId: "test_c",
					},
					snippet: {
						title: "test_c",
						description: "test_c",
						thumbnails: {
							default: {
								url: "test_c",
								width: 120,
								height: 90,
							},
							medium: {
								url: "test_c",
								width: 320,
								height: 180,
							},
							high: {
								url: "test_c",
								width: 480,
								height: 360,
							},
						},
					},
				},
				{
					id: {
						videoId: "test_d",
					},
					snippet: {
						title: "test_d",
						description: "test_d",
						thumbnails: {
							default: {
								url: "test_d",
								width: 120,
								height: 90,
							},
							medium: {
								url: "test_d",
								width: 320,
								height: 180,
							},
							high: {
								url: "test_d",
								width: 480,
								height: 360,
							},
						},
					},
				},
			],
		};

		fetchMock
			.get("https://www.googleapis.com")
			.intercept({
				path: `youtube/v3/search?key=TEST_API_KEY&channelId=${channelIdA}&part=snippet,id&order=date&maxResults=20`,
			})
			.reply(200, videoJosnForChannelA, {
				headers: { "Content-Type": "application/json" },
			});
		fetchMock
			.get("https://www.googleapis.com")
			.intercept({
				path: `youtube/v3/search?key=TEST_API_KEY&channelId=${channelIdB}&part=snippet,id&order=date&maxResults=20`,
			})
			.reply(200, videoJosnForChannelB, {
				headers: { "Content-Type": "application/json" },
			});

		const request = new IncomingRequest(`http://example.com/page/${uuid}`);
		const response = await worker.fetch(request, env);
		expect(response.status).toBe(200);

		const channelVideos = await env.random.get(`channel#${channelIdA}`);
		expect(channelVideos).not.toBeNull();
		expect(channelVideos).toBe(JSON.stringify(videoJosnForChannelA));

		const channelVideos2 = await env.random.get(`channel#${channelIdB}`);
		expect(channelVideos).not.toBeNull();
		expect(channelVideos2).toBe(JSON.stringify(videoJosnForChannelB));
	});
});
