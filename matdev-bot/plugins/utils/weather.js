/**
 * Weather Plugin - Get weather information
 */

const axios = require('axios');

module.exports = {
    name: 'weather',
    description: 'Get current weather information for any location',
    version: '1.0.0',
    command: ['weather', 'clima', 'temp'],
    category: 'utilities',
    usage: '<location>',
    fromMe: false,
    type: 'whatsapp',
    cooldown: 10,
    
    async function(message, match, bot) {
        try {
            const location = match ? match.trim() : '';
            
            if (!location) {
                await this.showWeatherMenu(message, bot);
                return;
            }
            
            await this.getWeatherInfo(message, location, bot);
            
        } catch (error) {
            await message.reply('❌ Weather command failed.');
            throw error;
        }
    },
    
    /**
     * Show weather menu and usage
     */
    async showWeatherMenu(message, bot) {
        const prefix = bot.config.PREFIX;
        
        let weatherText = `🌤️ *Weather Information*\n\n`;
        weatherText += `🌍 **Get Weather For Any Location:**\n`;
        weatherText += `• ${prefix}weather <city name>\n`;
        weatherText += `• ${prefix}weather <city, country>\n`;
        weatherText += `• ${prefix}weather <zip code>\n\n`;
        
        weatherText += `📋 **Examples:**\n`;
        weatherText += `• ${prefix}weather London\n`;
        weatherText += `• ${prefix}weather New York, USA\n`;
        weatherText += `• ${prefix}weather Tokyo, Japan\n`;
        weatherText += `• ${prefix}weather 10001\n\n`;
        
        weatherText += `🔍 **Features:**\n`;
        weatherText += `• Current temperature and conditions\n`;
        weatherText += `• Feels like temperature\n`;
        weatherText += `• Humidity and pressure\n`;
        weatherText += `• Wind speed and direction\n`;
        weatherText += `• Sunrise and sunset times\n`;
        weatherText += `• Weather forecast\n\n`;
        
        weatherText += `💡 **Tip:** Be specific with city names to get accurate results.`;
        
        await message.reply(weatherText);
    },
    
    /**
     * Get weather information for location
     */
    async getWeatherInfo(message, location, bot) {
        try {
            const apiKey = process.env.WEATHER_API_KEY || process.env.OPENWEATHERMAP_API_KEY || 'demo_key';
            
            if (apiKey === 'demo_key') {
                await message.reply('❌ Weather API key not configured. Please contact the bot administrator.');
                return;
            }
            
            await message.reply('🌤️ Getting weather information...');
            
            // Get current weather data
            const weatherData = await this.fetchWeatherData(location, apiKey);
            
            if (!weatherData) {
                await message.reply(`❌ Weather data not found for "${location}". Please check the location name and try again.`);
                return;
            }
            
            // Format and send weather information
            const weatherMessage = this.formatWeatherMessage(weatherData);
            await message.reply(weatherMessage);
            
        } catch (error) {
            if (error.response && error.response.status === 404) {
                await message.reply(`❌ Location "${location}" not found. Please check the spelling and try again.`);
            } else if (error.response && error.response.status === 401) {
                await message.reply('❌ Weather API key is invalid. Please contact the bot administrator.');
            } else {
                await message.reply('❌ Failed to get weather information. Please try again later.');
            }
            throw error;
        }
    },
    
    /**
     * Fetch weather data from API
     */
    async fetchWeatherData(location, apiKey) {
        try {
            // Using OpenWeatherMap API
            const currentWeatherUrl = `https://api.openweathermap.org/data/2.5/weather`;
            const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast`;
            
            const params = {
                q: location,
                appid: apiKey,
                units: 'metric'
            };
            
            // Fetch current weather
            const currentResponse = await axios.get(currentWeatherUrl, { params });
            const currentData = currentResponse.data;
            
            // Fetch 5-day forecast
            const forecastResponse = await axios.get(forecastUrl, { params });
            const forecastData = forecastResponse.data;
            
            return {
                current: currentData,
                forecast: forecastData
            };
            
        } catch (error) {
            throw error;
        }
    },
    
    /**
     * Format weather data into readable message
     */
    formatWeatherMessage(weatherData) {
        const current = weatherData.current;
        const forecast = weatherData.forecast;
        
        let weatherText = `🌤️ *Weather Information*\n\n`;
        
        // Location information
        weatherText += `📍 **Location:** ${current.name}`;
        if (current.sys.country) {
            weatherText += `, ${current.sys.country}`;
        }
        weatherText += `\n`;
        
        // Current weather
        const temp = Math.round(current.main.temp);
        const feelsLike = Math.round(current.main.feels_like);
        const description = current.weather[0].description;
        const icon = this.getWeatherEmoji(current.weather[0].main, current.weather[0].icon);
        
        weatherText += `\n🌡️ **Current Weather:**\n`;
        weatherText += `${icon} ${temp}°C (feels like ${feelsLike}°C)\n`;
        weatherText += `📝 ${description.charAt(0).toUpperCase() + description.slice(1)}\n`;
        
        // Additional details
        weatherText += `\n📊 **Details:**\n`;
        weatherText += `💧 Humidity: ${current.main.humidity}%\n`;
        weatherText += `🌪️ Pressure: ${current.main.pressure} hPa\n`;
        
        if (current.wind) {
            weatherText += `💨 Wind: ${current.wind.speed} m/s`;
            if (current.wind.deg) {
                weatherText += ` ${this.getWindDirection(current.wind.deg)}`;
            }
            weatherText += `\n`;
        }
        
        if (current.visibility) {
            weatherText += `👁️ Visibility: ${(current.visibility / 1000).toFixed(1)} km\n`;
        }
        
        // Sunrise/Sunset
        if (current.sys.sunrise && current.sys.sunset) {
            const sunrise = new Date(current.sys.sunrise * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            const sunset = new Date(current.sys.sunset * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            
            weatherText += `\n🌅 **Sun Times:**\n`;
            weatherText += `🌄 Sunrise: ${sunrise}\n`;
            weatherText += `🌇 Sunset: ${sunset}\n`;
        }
        
        // Temperature range
        if (current.main.temp_min !== current.main.temp_max) {
            const minTemp = Math.round(current.main.temp_min);
            const maxTemp = Math.round(current.main.temp_max);
            weatherText += `\n🌡️ **Range:** ${minTemp}°C - ${maxTemp}°C\n`;
        }
        
        // 3-day forecast
        if (forecast && forecast.list) {
            weatherText += `\n📅 **3-Day Forecast:**\n`;
            
            const dailyForecasts = this.groupForecastByDay(forecast.list);
            const days = Object.keys(dailyForecasts).slice(0, 3);
            
            days.forEach(day => {
                const dayData = dailyForecasts[day];
                const dayName = new Date(day).toLocaleDateString([], {weekday: 'short', month: 'short', day: 'numeric'});
                const minTemp = Math.round(Math.min(...dayData.map(item => item.main.temp_min)));
                const maxTemp = Math.round(Math.max(...dayData.map(item => item.main.temp_max)));
                const mainWeather = dayData[0].weather[0].main;
                const emoji = this.getWeatherEmoji(mainWeather);
                
                weatherText += `${emoji} ${dayName}: ${minTemp}°C - ${maxTemp}°C\n`;
            });
        }
        
        // Update time
        const updateTime = new Date().toLocaleString();
        weatherText += `\n🕐 *Updated: ${updateTime}*`;
        
        return weatherText;
    },
    
    /**
     * Get weather emoji based on condition
     */
    getWeatherEmoji(condition, icon = '') {
        const weatherEmojis = {
            'Clear': '☀️',
            'Clouds': '☁️',
            'Rain': '🌧️',
            'Drizzle': '🌦️',
            'Thunderstorm': '⛈️',
            'Snow': '🌨️',
            'Mist': '🌫️',
            'Smoke': '🌫️',
            'Haze': '🌫️',
            'Dust': '🌫️',
            'Fog': '🌫️',
            'Sand': '🌫️',
            'Ash': '🌋',
            'Squall': '💨',
            'Tornado': '🌪️'
        };
        
        // Check for night conditions
        if (icon && icon.endsWith('n')) {
            if (condition === 'Clear') return '🌙';
            if (condition === 'Clouds') return '☁️';
        }
        
        return weatherEmojis[condition] || '🌤️';
    },
    
    /**
     * Get wind direction from degrees
     */
    getWindDirection(degrees) {
        const directions = [
            'N', 'NNE', 'NE', 'ENE',
            'E', 'ESE', 'SE', 'SSE',
            'S', 'SSW', 'SW', 'WSW',
            'W', 'WNW', 'NW', 'NNW'
        ];
        
        const index = Math.round(degrees / 22.5) % 16;
        return directions[index];
    },
    
    /**
     * Group forecast data by day
     */
    groupForecastByDay(forecastList) {
        const grouped = {};
        
        forecastList.forEach(item => {
            const date = new Date(item.dt * 1000).toDateString();
            if (!grouped[date]) {
                grouped[date] = [];
            }
            grouped[date].push(item);
        });
        
        return grouped;
    }
};
