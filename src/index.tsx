import { Hono } from "hono";
import type { FC } from "hono/jsx";

const app = new Hono<{ Bindings: Env }>();

app.get("/", (c) => {
	const Top: FC = () => (
		<html>
			<body>
				<div>
					<a href="/new">NEW</a>
				</div>
			</body>
		</html>
	)
	return c.html(<Top />);
});


app.get("/new", async (c) => {
	const CACHE_DURATION = 24 * 3600 * 1000; // 1日
	const API_KEY = c.env.API_KEY;

	const keys = (await c.env.random.list()).keys;
	console.info("keys", keys);

	let videos: YoutubeVideo[] = [];
	for (const { name: channelId } of keys) {
		const { value: j, metadata } =
			await c.env.random.getWithMetadata<Metadata>(channelId);

		console.info("metadata", metadata);

		let data: YoutubeApiResponse;

		const now = Date.now();
		const isCacheExpired = !metadata || now > metadata.expiresAt;
		if (!j || isCacheExpired) {
			console.info("kv miss");
			const url = `https://www.googleapis.com/youtube/v3/search?key=${API_KEY}&channelId=${channelId}&part=snippet,id&order=date&maxResults=20`;
			const response = await fetch(url);

			data = await response.json();

			const expiresAt = now + CACHE_DURATION;
			await c.env.random.put(channelId, JSON.stringify(data), {
				metadata: { channelId, expiresAt },
			});
		} else {
			console.info("kv hit");
			data = JSON.parse(j);
		}
		videos = videos.concat(data.items);
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

		const html = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <meta property="og:title" content="${videoTitle}">
                <meta property="og:description" content="${videoDescription}">
                <meta property="og:image" content="${videoThumbnail}">
                <meta property="og:url" content="${videoUrl}">
                <title>${videoTitle}</title>
            </head>
            <body>
                <p>Redirecting to <a href="${videoUrl}">${videoTitle}</a></p>
            </body>
            </html>
        `;

		return c.html(html);
	} else {
		return c.redirect(videoUrl);
	}
});

export default app;

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
