---
name: Long-range transport of particulate matter in East Asia
tools: [Chemical transport modeling, Model development, Fortran, Lagrangian advection]
image: https://i.imgur.com/sh60Tjk.png
description: This research introduces PM-Tracker, a novel diagnostic tool for determining the impact of long-range transport in PM2.5 high-peak occurrences.
---

# Investigating the long-range transport of particulate matter in East Asia: Introducing a new Lagrangian diagnostic tool

This research introduces PM-Tracker, a novel diagnostic tool for determining the impact of long-range transport in PM2.5 high-peak occurrences. The module was built and deployed on the Community Multiscale Air Quality (CMAQ) modeling framework using the Trajectory Grid method as Lagrangian advection. To explore the applicability of the established model, we investigate the long-range transport of PM2.5 over East Asia, specifically from the North China Plain region to South Korea, during the early months of 2019. The time series of PM2.5 over the South Korean region combined with spatial distribution plots reveal three high-PM episodes during the simulation period. 

![preview](https://i.imgur.com/0UBNJoG.jpg)

We also compare modeled Aerosol Optical Depth (AOD) values of the episodes with Himawari-8 AOD retrievals. Moreover, Cloud-Aerosol Lidar and Infrared Pathfinder Satellite Observation (CALIPSO) lidar observations validate the transport of polluted air mass during the three high-PM episodes. According to our findings, the long-range transport of pollutants leads to high PM concentrations in the downwind region for January 14 and March 5 episodes.

![preview](https://i.imgur.com/9WVw2Dm.png)

The PM-Tracker module reveals clusters of trajectories with high values of PM2.5 (80–150 ug/m3) from the Shandong Peninsula and the Beijing region on both dates. Although PM2.5 concentrations were lower during the March 27 episode (∼60 ug/m3), we still observe some regional transport impact according to the results of PM-Tracker. The PM-Tracker module shows high amounts of nitrate, ammonium, and sulfate in the region and recognizes the advection process in CMAQ as the primary contributor to high PM episodes. 

![preview](https://i.imgur.com/sh60Tjk.png)


The aggregation of clustered trajectories with PM2.5 speciation and physical process contributions institutes the PM-Tracker module as a highly effective tool for the study of both local and long-range transport.

<p class="text-center">
{% include elements/button.html link="https://www.sciencedirect.com/science/article/abs/pii/S1352231022001613" text="Learn More" %}
</p>
