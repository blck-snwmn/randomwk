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
	const ud = crypto.randomUUID();
	await c.env.random.put(`uuid#${ud}`, "");
	return c.redirect(`/page/${ud}`);
});

app.get("/page/:uuid", async (c) => {
	const ud = c.req.param("uuid");
	const value = await c.env.random.get(keyOfUuid(ud));
	if (value === null) {
		return c.text("Not found", 404);
	}

	const video = await getYoutubeVideo(value, c.env);
	if (video === null) {
		return c.text("No videos found", 404);
	}
	await c.env.random.put(`uuid#${ud}`, JSON.stringify(video));

	const url = new URL(c.req.url);
	const shareUrl = `${url.origin}/share/${ud}`;
	const Page: FC<{ shareUrl: string }> = ({ shareUrl }) => (
		<html lang="ja">
			<head>
				<meta charset="UTF-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1.0" />
				<title>Share this video</title>
			</head>
			<body>
				<p>
					Share this link: <a href={shareUrl}>{shareUrl}</a>
				</p>
				<button
					type="button"
					onclick={`navigator.clipboard.writeText('${shareUrl}')`}
				>
					Copy Link
				</button>
			</body>
		</html>
	);

	return c.html(<Page shareUrl={shareUrl} />);
});

app.get("/share/:uuid", async (c) => {
	const ud = c.req.param("uuid");
	const value = await c.env.random.get(keyOfUuid(ud));
	if (value === null) {
		return c.text("Not found", 404);
	}

	const video = JSON.parse(value);
	const videoUrl = `https://www.youtube.com/watch?v=${video.id.videoId}`;
	const userAgent = c.req.header("User-Agent") || "";
	const isBot = /bot|crawl|spider|slurp|facebookexternalhit/i.test(userAgent);

	if (isBot) {
		// if the request is from a bot, return the ogp page
		return c.html(<OgPage snippet={video.snippet} url={videoUrl} />);
	}
	return c.redirect(videoUrl);
});

const OgPage: FC<{ snippet: YoutubeVideoSnippet; url: string }> = ({
	snippet,
	url,
}) => (
	<html lang="ja">
		<head>
			<meta charset="UTF-8" />
			<meta name="viewport" content="width=device-width, initial-scale=1.0" />
			<meta property="og:title" content={snippet.title} />
			<meta property="og:description" content={snippet.description} />
			<meta property="og:image" content={snippet.thumbnails.high.url} />
			<meta property="og:url" content={url} />
			<title>{snippet.title}</title>
		</head>
		<body>
			<p>
				Redirecting to <a href={url}>{snippet.title}</a>
			</p>
		</body>
	</html>
);

export default app;

const getYoutubeVideo = async (
	value: string,
	env: Env,
): Promise<YoutubeVideo | null> => {
	if (value) {
		return JSON.parse(value);
	}
	const keys = (await env.random.list({ prefix: prefixOfChannel })).keys;
	console.info("keys", keys);

	const results = await Promise.all(
		keys.map(async ({ name: prefixedChannelID }) => {
			const channelID = prefixedChannelID.replace(prefixOfChannel, "");
			const channelVideos = await fetchYoutubeVideosFromCache(channelID, env);
			return { channelId: channelID, channelVideos };
		}),
	);

	const videos = results.flatMap((result) => result.channelVideos);
	const expiredChannels = results
		.filter((result) => result.channelVideos.length === 0)
		.map((result) => result.channelId);

	for (const channelId of expiredChannels) {
		const channelVideos = await fetchYoutubeVideos(channelId, env);
		videos.push(...channelVideos);
	}

	if (videos.length === 0) {
		return null;
	}

	return videos[Math.floor(Math.random() * videos.length)];
};

const fetchYoutubeVideosFromCache = async (
	channelId: string,
	env: Env,
): Promise<YoutubeVideo[]> => {
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

	return [];
};

const fetchYoutubeVideos = async (
	channelId: string,
	env: Env,
): Promise<YoutubeVideo[]> => {
	const API_KEY = env.API_KEY;
	const CACHE_DURATION = 24 * 3600 * 1000; // 1日

	const { metadata } = await env.random.getWithMetadata<Metadata>(channelId);

	console.info("metadata", metadata);

	const now = Date.now();

	console.info(`kv miss or cache expired: ${channelId}`);
	const url = `https://www.googleapis.com/youtube/v3/search?key=${API_KEY}&channelId=${channelId}&part=snippet,id&order=date&maxResults=20`;
	const response = await fetch(url);
	const data: YoutubeApiResponse = await response.json();

	const expiresAt = now + CACHE_DURATION;
	await env.random.put(keyOfChannel(channelId), JSON.stringify(data), {
		metadata: { channelId, expiresAt },
	});

	return data.items;
};

function keyOfUuid(uuid: string) {
	return `uuid#${uuid}`;
}

const prefixOfChannel = "channel#";

function keyOfChannel(channelId: string) {
	return `${prefixOfChannel}${channelId}`;
}

interface YoutubeVideo {
	id: {
		videoId: string;
	};
	snippet: YoutubeVideoSnippet;
}

interface YoutubeVideoSnippet {
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
}

interface YoutubeApiResponse {
	items: YoutubeVideo[];
}

interface Metadata {
	channelId: string;
	expiresAt: number;
}
