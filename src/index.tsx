import { Hono } from "hono";
import type { FC } from "hono/jsx";

const app = new Hono<{ Bindings: Env }>();

app.get("/", (c) => {
	const Top: FC = () => (
		<html lang="ja">
			<body>
				<div>
					<a href="/new">NEW</a>
				</div>
			</body>
		</html>
	);
	return c.html(<Top />);
});

app.get("/new", async (c) => {
	const keys = (await c.env.random.list({ prefix: "channel#" })).keys;
	console.info("keys", keys);

	let videos: YoutubeVideo[] = [];
	for (const { name: channelId } of keys) {
		const channelVideos = await fetchYoutubeVideos(channelId.replace("channel#", ""), c.env);
		videos = videos.concat(channelVideos);
	}

	if (videos.length === 0) {
		return c.text("No videos found", 404);
	}

	const randomVideo = videos[Math.floor(Math.random() * videos.length)];
	const videoUrl = `https://www.youtube.com/watch?v=${randomVideo.id.videoId}`;

	const userAgent = c.req.header("User-Agent") || "";
	const isBot = /bot|crawl|spider|slurp|facebookexternalhit/i.test(userAgent);

	if (isBot) {
		const videoTitle = randomVideo.snippet.title;
		const videoDescription = randomVideo.snippet.description;
		const videoThumbnail = randomVideo.snippet.thumbnails.high.url;

		const OgPage = () => (
			<html lang="ja">
				<head>
					<meta charset="UTF-8" />
					<meta
						name="viewport"
						content="width=device-width, initial-scale=1.0"
					/>
					<meta property="og:title" content={videoTitle} />
					<meta property="og:description" content={videoDescription} />
					<meta property="og:image" content={videoThumbnail} />
					<meta property="og:url" content={videoUrl} />
					<title>{videoTitle}</title>
				</head>
				<body>
					<p>
						Redirecting to <a href={videoUrl}>{videoTitle}</a>
					</p>
				</body>
			</html>
		);

		return c.html(<OgPage />);
	}
	return c.redirect(videoUrl);
});

export default app;

const fetchYoutubeVideos = async (
	channelId: string,
	env: Env,
): Promise<YoutubeVideo[]> => {
	const API_KEY = env.API_KEY;
	const CACHE_DURATION = 24 * 3600 * 1000; // 1日

	const { value, metadata } =
		await env.random.getWithMetadata<Metadata>(channelId);

	console.info("metadata", metadata);

	const now = Date.now();
	const isCacheExpired = !metadata || now > metadata.expiresAt;
	if (value && !isCacheExpired) {
		console.info(`kv hit: ${channelId}`);
		const data: YoutubeApiResponse = JSON.parse(value);
		return data.items;
	}

	console.info(`kv miss or cache expired: ${channelId}`);
	const url = `https://www.googleapis.com/youtube/v3/search?key=${API_KEY}&channelId=${channelId}&part=snippet,id&order=date&maxResults=20`;
	const response = await fetch(url);
	const data: YoutubeApiResponse = await response.json();

	const expiresAt = now + CACHE_DURATION;
	await env.random.put(channelId, JSON.stringify(data), {
		metadata: { channelId, expiresAt },
	});

	return data.items;
};

interface YoutubeVideo {
	id: {
		videoId: string;
	};
	snippet: {
		title: string;
		description: string;
		thumbnails: {
			default: {
				url: string;
				width: number;
				height: number;
			};
			medium: {
				url: string;
				width: number;
				height: number;
			};
			high: {
				url: string;
				width: number;
				height: number;
			};
		};
	};
}

interface YoutubeApiResponse {
	items: YoutubeVideo[];
}

interface Metadata {
	channelId: string;
	expiresAt: number;
}
